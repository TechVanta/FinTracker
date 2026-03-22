import config from "../config.js";

const CATEGORIES = ["Food", "Travel", "Groceries", "Bills", "Shopping", "Entertainment", "Other"];

const SYSTEM_PROMPT = `You are a financial transaction categorizer. Given a list of transaction descriptions, categorize each one into exactly one of these categories:
${JSON.stringify(CATEGORIES)}

Respond ONLY with a JSON array of category strings in the same order as the input.
Example input: ["UBER TRIP", "NETFLIX SUBSCRIPTION", "WALMART GROCERY"]
Example output: ["Travel", "Entertainment", "Groceries"]`;

const PROVIDER_URLS = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

const PROVIDER_MODELS = {
  groq: "llama-3.1-8b-instant",
  openai: "gpt-4o-mini",
};

export async function categorizeWithLLM(descriptions) {
  const provider = config.llm.provider.toLowerCase();
  const url = PROVIDER_URLS[provider];
  const model = PROVIDER_MODELS[provider];

  if (!url || !config.llm.apiKey) return null;

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(descriptions) },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.choices[0].message.content;
    const categories = JSON.parse(content);

    return categories.map((cat) =>
      CATEGORIES.includes(cat) ? cat : "Other"
    );
  } catch (err) {
    console.warn("LLM categorization failed:", err.message);
    return null;
  }
}

// Rule-based fallback
const KEYWORD_RULES = {
  Food: ["restaurant", "mcdonald", "starbucks", "uber eats", "doordash", "pizza", "burger", "cafe", "subway", "chipotle", "kfc", "wendy"],
  Travel: ["uber", "lyft", "airline", "flight", "hotel", "airbnb", "gas station", "shell", "parking", "transit", "taxi"],
  Groceries: ["walmart", "costco", "trader joe", "whole foods", "kroger", "safeway", "supermarket", "grocery", "market", "aldi", "target"],
  Bills: ["electric", "hydro", "internet", "phone", "insurance", "rent", "mortgage", "water", "utility", "verizon", "at&t", "comcast"],
  Shopping: ["amazon", "best buy", "apple store", "nike", "zara", "h&m", "nordstrom", "ebay", "etsy"],
  Entertainment: ["netflix", "spotify", "hulu", "disney", "cinema", "theatre", "game", "steam", "playstation", "xbox", "youtube", "hbo"],
};

export function categorizeByRules(description) {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(KEYWORD_RULES)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "Other";
}

export async function categorizeTransactions(descriptions) {
  const llmResult = await categorizeWithLLM(descriptions);
  if (llmResult && llmResult.length === descriptions.length) return llmResult;
  return descriptions.map(categorizeByRules);
}
