// =============================================================================
// LLM Integration & 3-Layer Categorization Pipeline
// =============================================================================
// This module handles all LLM interactions and orchestrates the categorization
// of financial transactions using a cost-optimized 3-layer approach:
//
//   Layer 1: Merchant Mapping Table (DynamoDB lookup)
//            → Cost: $0 | Speed: ~5ms | Target hit rate: 70-80%
//
//   Layer 2: Keyword Rules (in-memory matching from category keywords)
//            → Cost: $0 | Speed: <1ms | Catches ~15% of remaining
//
//   Layer 3: Groq LLM (API call for truly unknown merchants)
//            → Cost: $0 on free tier | Speed: 200-500ms | Last resort
//            → Result is cached in merchant mapping table (auto-learning)
//
// This architecture means ~80-90% of transactions never touch the LLM,
// keeping costs at $0 and response times fast.
//
// Also provides Groq Vision integration for receipt image extraction.
// =============================================================================

import config from "../config.js";
import { lookupMerchant, learnMerchantCategory } from "../services/merchantService.js";
import { buildKeywordMap } from "../services/categoryService.js";

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

/** Supported LLM provider API endpoints */
const PROVIDER_URLS = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

/** Text models for categorization — fast, cheap, good enough */
const PROVIDER_MODELS = {
  groq: "llama-3.1-8b-instant",
  openai: "gpt-4o-mini",
};

/** Vision model for receipt image extraction (Groq only for MVP) */
const VISION_MODEL = "llama-3.2-11b-vision-preview";

// =============================================================================
// LAYER 2: KEYWORD-BASED CATEGORIZATION
// =============================================================================

/**
 * Categorize a transaction description using keyword matching.
 * Keywords come from the dynamic categories table (not hardcoded).
 *
 * Checks if any category keyword appears as a substring in the description.
 * Keywords are sorted by length descending so more specific matches win
 * (e.g., "tim hortons" matches before "tim").
 *
 * @param {string} description - Transaction description to categorize
 * @param {Array} keywordMap - Pre-built keyword→category pairs from buildKeywordMap()
 * @returns {string|null} Category name if matched, null otherwise
 */
function categorizeByKeywords(description, keywordMap) {
  const lower = description.toLowerCase();
  for (const { keyword, categoryName } of keywordMap) {
    if (lower.includes(keyword)) {
      return categoryName;
    }
  }
  return null;
}

// =============================================================================
// LAYER 3: LLM-BASED CATEGORIZATION
// =============================================================================

/**
 * Send a batch of transaction descriptions to the LLM for categorization.
 * Used only as a last resort for transactions that couldn't be categorized
 * by the merchant mapping table or keyword rules.
 *
 * The LLM receives the list of active category names and must choose one
 * for each description. Results are cached in the merchant mapping table
 * so the same merchant is never sent to the LLM twice.
 *
 * @param {string[]} descriptions - Transaction descriptions to categorize
 * @param {string[]} categoryNames - Valid category names to choose from
 * @returns {string[]|null} Array of category names, or null if LLM call failed
 */
async function categorizeWithLLM(descriptions, categoryNames) {
  const provider = config.llm.provider.toLowerCase();
  const url = PROVIDER_URLS[provider];
  const model = PROVIDER_MODELS[provider];

  // If LLM is not configured, return null (caller will use "Other")
  if (!url || !config.llm.apiKey) return null;

  const systemPrompt = `You are a financial transaction categorizer for a Canadian personal finance app.
Given a list of transaction descriptions, categorize each one into exactly one of these categories:
${JSON.stringify(categoryNames)}

Rules:
- Respond ONLY with a valid JSON array of category strings, in the same order as the input.
- Each element must be one of the categories listed above.
- If unsure, use "Other".
- Consider Canadian merchants and services (Tim Hortons, Loblaws, Petro-Canada, etc.).

Example input: ["TIM HORTONS #1234", "NETFLIX.COM", "COSTCO WHOLESALE"]
Example output: ["Dining", "Entertainment", "Groceries"]`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(descriptions) },
        ],
        temperature: 0, // Deterministic output — same input always gets same category
      }),
    });

    if (!response.ok) {
      console.warn(`LLM API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse the JSON response — handle cases where the LLM wraps it in markdown
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const categories = JSON.parse(cleanContent);

    // Validate: every category must be in the allowed list
    return categories.map((cat) =>
      categoryNames.includes(cat) ? cat : "Other"
    );
  } catch (err) {
    console.warn("LLM categorization failed:", err.message);
    return null;
  }
}

// =============================================================================
// 3-LAYER CATEGORIZATION PIPELINE (Main Entry Point)
// =============================================================================

/**
 * Categorize an array of transaction descriptions using the 3-layer pipeline.
 *
 * This is the main categorization function called by the file processing
 * pipeline. It processes each description through:
 *   1. Merchant mapping table lookup (fastest, $0)
 *   2. Keyword rules from categories table ($0)
 *   3. LLM batch call for remaining unknowns ($0 on Groq free tier)
 *
 * Results from Layer 3 are automatically cached in the merchant mapping
 * table so the same merchant is never sent to the LLM again.
 *
 * @param {string[]} descriptions - Array of transaction descriptions
 * @returns {string[]} Array of category names (same order as input)
 */
export async function categorizeTransactions(descriptions) {
  // Pre-build the keyword map once for this batch (avoids N database calls)
  const keywordMap = await buildKeywordMap();

  // Get the list of valid category names for the LLM prompt
  const categoryNames = [...new Set(keywordMap.map((p) => p.categoryName)), "Other"];

  // Track which descriptions still need categorization
  const results = new Array(descriptions.length).fill(null);
  const unknownIndices = []; // Indices that need LLM categorization

  // ── LAYER 1: Merchant Mapping Table ──────────────────────────────────
  // Check each description against the merchant mapping table.
  // This is a DynamoDB GetItem per description — fast and free.
  for (let i = 0; i < descriptions.length; i++) {
    const category = await lookupMerchant(descriptions[i]);
    if (category) {
      results[i] = category;
    }
  }

  // ── LAYER 2: Keyword Rules ───────────────────────────────────────────
  // For descriptions not matched by Layer 1, try keyword matching.
  for (let i = 0; i < descriptions.length; i++) {
    if (results[i]) continue; // Already categorized by Layer 1

    const category = categorizeByKeywords(descriptions[i], keywordMap);
    if (category) {
      results[i] = category;
    } else {
      unknownIndices.push(i);
    }
  }

  const layer1Hits = results.filter(Boolean).length - unknownIndices.length;
  const layer2Hits = results.filter(Boolean).length - layer1Hits;
  console.log(`Categorization: ${layer1Hits} merchant DB, ${layer2Hits} keyword, ${unknownIndices.length} need LLM`);

  // ── LAYER 3: LLM (batch call for remaining unknowns) ────────────────
  if (unknownIndices.length > 0) {
    const unknownDescriptions = unknownIndices.map((i) => descriptions[i]);
    const llmResults = await categorizeWithLLM(unknownDescriptions, categoryNames);

    if (llmResults && llmResults.length === unknownDescriptions.length) {
      for (let j = 0; j < unknownIndices.length; j++) {
        const idx = unknownIndices[j];
        results[idx] = llmResults[j];

        // Cache the LLM result in the merchant mapping table (auto-learning).
        // Fire-and-forget — don't block the pipeline on cache writes.
        learnMerchantCategory(descriptions[idx], llmResults[j], "llm_cache").catch((err) => {
          console.warn("Failed to cache LLM result:", err.message);
        });
      }
    } else {
      // LLM failed — fall back to "Other" for all unknowns
      for (const idx of unknownIndices) {
        results[idx] = "Other";
      }
    }
  }

  // Final safety net: any remaining nulls become "Other"
  return results.map((r) => r || "Other");
}

// =============================================================================
// GROQ VISION — Receipt Image Extraction
// =============================================================================

/**
 * Extract transaction data from a receipt image using Groq Vision.
 *
 * Takes a base64-encoded image of a receipt/bill and uses the Llama 3.2
 * Vision model to extract structured data: merchant name, date, total
 * amount, and optionally line items.
 *
 * This is the core of the receipt scanning feature — the function that
 * turns a photo into financial data.
 *
 * Cost: $0 on Groq free tier (rate limited to ~30 requests/minute).
 *
 * @param {string} base64Image - Base64-encoded image data
 * @param {string} mimeType - Image MIME type (e.g., "image/jpeg", "image/png")
 * @returns {Object} Extracted data: { merchant, date, total, items, raw_text }
 * @throws {Error} If the image is unreadable or the API call fails
 */
export async function extractFromImage(base64Image, mimeType = "image/jpeg") {
  if (!config.llm.apiKey) {
    throw new Error("LLM API key is not configured — cannot process images");
  }

  const extractionPrompt = `You are a receipt/document data extraction system for a Canadian personal finance app.

Analyze this image and extract financial transaction data.

IMPORTANT RULES:
- Extract the merchant/store name, date, and total amount
- If this is a receipt with line items, extract each item with its price
- Dates should be in YYYY-MM-DD format
- Amounts should be numbers (no $ sign), using the final/total amount
- For Canadian receipts, the total usually appears after tax lines (GST/HST/PST)
- If you cannot read the image clearly, say so in the error field

Respond with ONLY valid JSON in this exact format:
{
  "merchant": "Store Name",
  "date": "2026-01-15",
  "total": 45.67,
  "items": [
    {"name": "Item description", "amount": 12.99},
    {"name": "Another item", "amount": 32.68}
  ],
  "tax": 5.92,
  "error": null
}

If you cannot read the receipt or it's not a financial document, respond with:
{"merchant": null, "date": null, "total": null, "items": [], "tax": null, "error": "Description of the problem"}`;

  try {
    const response = await fetch(PROVIDER_URLS.groq, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractionPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        temperature: 0, // Deterministic — same image should give same extraction
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq Vision API error (${response.status}):`, errorText);
      throw new Error(`Image processing failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse the JSON response — handle markdown code blocks
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const extracted = JSON.parse(cleanContent);

    // Validate the extraction has at least a merchant or total
    if (extracted.error) {
      console.warn("Vision extraction reported error:", extracted.error);
    }

    return extracted;
  } catch (err) {
    // If JSON parsing fails, the model returned something unexpected
    if (err instanceof SyntaxError) {
      console.error("Failed to parse Vision API response as JSON");
      return {
        merchant: null,
        date: null,
        total: null,
        items: [],
        tax: null,
        error: "Could not parse receipt data from image",
      };
    }
    throw err;
  }
}

/**
 * Extract transaction data from a screenshot of a banking app.
 *
 * This is a more specialized version of extractFromImage that handles
 * screenshots showing multiple transactions (e.g., a user screenshots
 * their banking app's transaction list).
 *
 * Returns an array of transactions instead of a single receipt.
 *
 * @param {string} base64Image - Base64-encoded screenshot
 * @param {string} mimeType - Image MIME type
 * @returns {Array<{date: string, description: string, amount: number}>}
 */
export async function extractTransactionsFromScreenshot(base64Image, mimeType = "image/jpeg") {
  if (!config.llm.apiKey) {
    throw new Error("LLM API key is not configured — cannot process images");
  }

  const extractionPrompt = `You are a financial document extraction system for a Canadian personal finance app.

This image appears to be a screenshot of a banking app, credit card statement, or transaction list.

Extract ALL visible transactions. For each transaction, extract:
- date: in YYYY-MM-DD format (use the current year if not shown)
- description: the merchant or transaction description
- amount: the dollar amount as a positive number (no $ sign)

Respond with ONLY valid JSON in this exact format:
{
  "transactions": [
    {"date": "2026-01-15", "description": "TIM HORTONS #1234", "amount": 5.67},
    {"date": "2026-01-14", "description": "LOBLAWS 1001", "amount": 89.34}
  ],
  "error": null
}

If you cannot read the image, respond with:
{"transactions": [], "error": "Description of the problem"}`;

  try {
    const response = await fetch(PROVIDER_URLS.groq, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractionPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 4096, // Screenshots may have many transactions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq Vision API error (${response.status}):`, errorText);
      throw new Error(`Screenshot processing failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const extracted = JSON.parse(cleanContent);

    if (extracted.error) {
      console.warn("Screenshot extraction reported error:", extracted.error);
    }

    return extracted;
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("Failed to parse Vision API response as JSON");
      return { transactions: [], error: "Could not parse transaction data from screenshot" };
    }
    throw err;
  }
}
