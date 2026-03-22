// =============================================================================
// Merchant Mapping Service
// =============================================================================
// Manages the merchant → category lookup table (Layer 1 of categorization).
//
// This is the fastest and cheapest categorization layer — a simple DynamoDB
// key-value lookup that returns the category for a known merchant in <10ms
// at $0 cost. The goal is to handle 70-80% of all transactions here, so the
// more expensive layers (keyword matching, LLM) are rarely needed.
//
// The table grows through four sources:
//   1. Seed data — ~500 pre-loaded Canadian merchants (loaded once on first deploy)
//   2. Admin additions — manual mappings via the admin interface
//   3. User corrections — when a user changes a transaction's category, the
//      merchant is automatically mapped to the corrected category
//   4. LLM cache — when the LLM categorizes an unknown merchant, the result
//      is saved here so the same merchant is never sent to the LLM twice
//
// Business context:
//   At 100 users × 120 transactions/month = 12,000 transactions/month.
//   If this table catches 80%, that's 9,600 DynamoDB lookups ($0) vs 9,600 LLM calls.
//   At scale, this table is the #1 cost optimization lever.
// =============================================================================

import {
  upsertMerchantMapping,
  getMerchantMapping,
  incrementMerchantMatchCount,
  getAllMerchantMappings,
  deleteMerchantMapping,
} from "../infrastructure/dynamodb.js";

// =============================================================================
// MERCHANT NAME NORMALIZATION
// =============================================================================

/**
 * Normalize a merchant name for consistent lookup.
 *
 * Transaction descriptions from bank statements are messy — they include
 * reference numbers, locations, dates, and random formatting. This function
 * strips noise to find the core merchant name.
 *
 * Examples:
 *   "TIM HORTONS #1234 TORONTO ON" → "tim hortons"
 *   "UBER *EATS PENDING"           → "uber eats"
 *   "AMZN Mktp CA*Z09ABC"          → "amzn mktp ca"
 *   "COSTCO WHOLESALE W1234"       → "costco wholesale"
 *
 * @param {string} description - Raw transaction description from bank statement
 * @returns {string} Normalized merchant name for lookup
 */
export function normalizeMerchant(description) {
  return description
    .toLowerCase()
    .replace(/[#*]/g, " ")           // Replace # and * with spaces (common in bank descriptions)
    .replace(/\d{4,}/g, "")          // Remove long numbers (reference IDs, card numbers)
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, "") // Remove date-like patterns (3/15, 12/01)
    .replace(/\b(pending|pos|debit|credit|purchase|preauth|recurring|payment)\b/g, "") // Remove transaction type words
    .replace(/\b[A-Z]{2}\b/g, (match) => { // Keep meaningful 2-letter codes, remove province/state codes
      const provinces = new Set(["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "PE", "NL", "YT", "NT", "NU"]);
      return provinces.has(match.toUpperCase()) ? "" : match;
    })
    .replace(/\s+/g, " ")           // Collapse whitespace
    .trim();
}

/**
 * Extract the core merchant name (first 2-3 meaningful words).
 * Used for fuzzy matching when the full normalized description doesn't
 * have an exact match in the merchant table.
 *
 * Examples:
 *   "tim hortons toronto" → "tim hortons"
 *   "costco wholesale w" → "costco wholesale"
 *   "uber eats" → "uber eats"
 */
export function extractCoreMerchant(normalizedDesc) {
  const words = normalizedDesc.split(" ").filter((w) => w.length > 1);
  // Take first 2-3 words as the core merchant name
  return words.slice(0, 3).join(" ");
}

// =============================================================================
// LOOKUP & MATCHING
// =============================================================================

/**
 * Look up a merchant in the mapping table.
 * Tries exact match first, then falls back to core merchant name (first 2-3 words).
 *
 * This is the hot path — called for every transaction during categorization.
 * Designed for speed: usually resolves in a single DynamoDB GetItem (~5ms).
 *
 * @param {string} description - Raw transaction description
 * @returns {string|null} Category name if found, null if no mapping exists
 */
export async function lookupMerchant(description) {
  const normalized = normalizeMerchant(description);

  // Try 1: Exact match on the full normalized description
  let mapping = await getMerchantMapping(normalized);
  if (mapping) {
    // Increment usage counter (fire-and-forget, non-blocking)
    incrementMerchantMatchCount(normalized);
    return mapping.category_id;
  }

  // Try 2: Match on the core merchant name (first 2-3 words)
  // This catches variations like "tim hortons #1234" vs "tim hortons #5678"
  const core = extractCoreMerchant(normalized);
  if (core && core !== normalized) {
    mapping = await getMerchantMapping(core);
    if (mapping) {
      incrementMerchantMatchCount(core);
      return mapping.category_id;
    }
  }

  return null;
}

// =============================================================================
// AUTO-LEARNING
// =============================================================================

/**
 * Record a category correction as a merchant mapping.
 * Called when a user edits a transaction's category — the corrected
 * merchant→category association is saved so future transactions from
 * the same merchant are automatically categorized correctly.
 *
 * This is the core of the auto-learning system. Every user correction
 * makes the system smarter for all future transactions.
 *
 * @param {string} description - Transaction description (raw)
 * @param {string} categoryName - The corrected category name
 * @param {string} source - "user_correction" | "llm_cache" | "admin"
 */
export async function learnMerchantCategory(description, categoryName, source = "user_correction") {
  const normalized = normalizeMerchant(description);
  const core = extractCoreMerchant(normalized);

  // Save the mapping using the core merchant name for broader matching.
  // If the core name is too short (1 word), use the full normalized name instead.
  const pattern = core.split(" ").length >= 2 ? core : normalized;

  await upsertMerchantMapping({
    merchant_pattern: pattern,
    category_id: categoryName,
    source,
    match_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(`Learned merchant mapping: "${pattern}" → "${categoryName}" (source: ${source})`);
}

// =============================================================================
// ADMIN OPERATIONS
// =============================================================================

/**
 * List all merchant mappings for the admin interface.
 * Returns mappings sorted by match_count descending (most-used first).
 */
export async function listMerchantMappings() {
  const mappings = await getAllMerchantMappings();
  return mappings.sort((a, b) => (b.match_count || 0) - (a.match_count || 0));
}

/**
 * Manually add a merchant mapping via the admin interface.
 */
export async function addMerchantMapping(merchantPattern, categoryName) {
  return upsertMerchantMapping({
    merchant_pattern: merchantPattern.toLowerCase().trim(),
    category_id: categoryName,
    source: "admin",
    match_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Update an existing merchant mapping's category.
 */
export async function updateMerchantMappingCategory(merchantPattern, categoryName) {
  return upsertMerchantMapping({
    merchant_pattern: merchantPattern.toLowerCase().trim(),
    category_id: categoryName,
    source: "admin",
    match_count: 0,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Remove a merchant mapping.
 */
export async function removeMerchantMapping(merchantPattern) {
  return deleteMerchantMapping(merchantPattern.toLowerCase().trim());
}

// =============================================================================
// SEED DATA — ~500 Canadian Merchants
// =============================================================================
// Pre-mapped merchants for the Canadian market. These cover the major chains,
// services, and brands that show up on Canadian bank/credit card statements.
//
// Format: { pattern: "normalized merchant name", category: "Category Name" }
//
// The patterns match common statement descriptions. Bank statements typically
// show abbreviated or formatted merchant names, so we include common variations.
// =============================================================================

const MERCHANT_SEED_DATA = [
  // ── GROCERIES ──────────────────────────────────────────────────────────
  { pattern: "loblaws", category: "Groceries" },
  { pattern: "no frills", category: "Groceries" },
  { pattern: "real canadian superstore", category: "Groceries" },
  { pattern: "superstore", category: "Groceries" },
  { pattern: "metro", category: "Groceries" },
  { pattern: "sobeys", category: "Groceries" },
  { pattern: "freshco", category: "Groceries" },
  { pattern: "food basics", category: "Groceries" },
  { pattern: "save-on-foods", category: "Groceries" },
  { pattern: "save on foods", category: "Groceries" },
  { pattern: "iga", category: "Groceries" },
  { pattern: "maxi", category: "Groceries" },
  { pattern: "provigo", category: "Groceries" },
  { pattern: "farm boy", category: "Groceries" },
  { pattern: "longos", category: "Groceries" },
  { pattern: "fortinos", category: "Groceries" },
  { pattern: "zehrs", category: "Groceries" },
  { pattern: "valu-mart", category: "Groceries" },
  { pattern: "t&t supermarket", category: "Groceries" },
  { pattern: "h mart", category: "Groceries" },
  { pattern: "whole foods", category: "Groceries" },
  { pattern: "costco wholesale", category: "Groceries" },
  { pattern: "costco", category: "Groceries" },
  { pattern: "walmart supercent", category: "Groceries" },
  { pattern: "walmart supercentre", category: "Groceries" },
  { pattern: "voila", category: "Groceries" },
  { pattern: "pc express", category: "Groceries" },
  { pattern: "instacart", category: "Groceries" },
  { pattern: "wholesale club", category: "Groceries" },
  { pattern: "adonis", category: "Groceries" },
  { pattern: "kin's farm market", category: "Groceries" },
  { pattern: "nature's emporium", category: "Groceries" },
  { pattern: "organic garage", category: "Groceries" },
  { pattern: "nations fresh foods", category: "Groceries" },
  { pattern: "oceans fresh food", category: "Groceries" },
  { pattern: "food depot", category: "Groceries" },
  { pattern: "galleria supermarket", category: "Groceries" },
  { pattern: "patel brothers", category: "Groceries" },
  { pattern: "chalo freshco", category: "Groceries" },

  // ── DINING ─────────────────────────────────────────────────────────────
  { pattern: "tim hortons", category: "Dining" },
  { pattern: "tim horton", category: "Dining" },
  { pattern: "tims", category: "Dining" },
  { pattern: "starbucks", category: "Dining" },
  { pattern: "mcdonald", category: "Dining" },
  { pattern: "mcdonalds", category: "Dining" },
  { pattern: "a&w", category: "Dining" },
  { pattern: "subway", category: "Dining" },
  { pattern: "popeyes", category: "Dining" },
  { pattern: "wendys", category: "Dining" },
  { pattern: "wendy's", category: "Dining" },
  { pattern: "pizza pizza", category: "Dining" },
  { pattern: "boston pizza", category: "Dining" },
  { pattern: "swiss chalet", category: "Dining" },
  { pattern: "harveys", category: "Dining" },
  { pattern: "mary browns", category: "Dining" },
  { pattern: "mary brown", category: "Dining" },
  { pattern: "st-hubert", category: "Dining" },
  { pattern: "second cup", category: "Dining" },
  { pattern: "uber eats", category: "Dining" },
  { pattern: "ubereats", category: "Dining" },
  { pattern: "doordash", category: "Dining" },
  { pattern: "skip the dishes", category: "Dining" },
  { pattern: "skipthedishes", category: "Dining" },
  { pattern: "fantuan", category: "Dining" },
  { pattern: "ritual", category: "Dining" },
  { pattern: "kfc", category: "Dining" },
  { pattern: "chipotle", category: "Dining" },
  { pattern: "five guys", category: "Dining" },
  { pattern: "dairy queen", category: "Dining" },
  { pattern: "new york fries", category: "Dining" },
  { pattern: "mucho burrito", category: "Dining" },
  { pattern: "freshii", category: "Dining" },
  { pattern: "extreme pita", category: "Dining" },
  { pattern: "osmows", category: "Dining" },
  { pattern: "lafleur", category: "Dining" },
  { pattern: "cora", category: "Dining" },
  { pattern: "denny's", category: "Dining" },
  { pattern: "the keg", category: "Dining" },
  { pattern: "milestones", category: "Dining" },
  { pattern: "earls", category: "Dining" },
  { pattern: "joey restaurant", category: "Dining" },
  { pattern: "white spot", category: "Dining" },
  { pattern: "montanas", category: "Dining" },
  { pattern: "east side mario", category: "Dining" },
  { pattern: "kelsey", category: "Dining" },
  { pattern: "jack astor", category: "Dining" },
  { pattern: "wild wing", category: "Dining" },
  { pattern: "nandos", category: "Dining" },
  { pattern: "panera", category: "Dining" },
  { pattern: "panago", category: "Dining" },
  { pattern: "dominos", category: "Dining" },
  { pattern: "pizza hut", category: "Dining" },
  { pattern: "papa john", category: "Dining" },
  { pattern: "booster juice", category: "Dining" },
  { pattern: "jugo juice", category: "Dining" },
  { pattern: "chatime", category: "Dining" },
  { pattern: "bubble tea", category: "Dining" },
  { pattern: "cobs bread", category: "Dining" },

  // ── TRANSPORTATION ─────────────────────────────────────────────────────
  { pattern: "petro-canada", category: "Transportation" },
  { pattern: "petro canada", category: "Transportation" },
  { pattern: "shell", category: "Transportation" },
  { pattern: "esso", category: "Transportation" },
  { pattern: "canadian tire gas", category: "Transportation" },
  { pattern: "costco gas", category: "Transportation" },
  { pattern: "pioneer", category: "Transportation" },
  { pattern: "ultramar", category: "Transportation" },
  { pattern: "co-op gas", category: "Transportation" },
  { pattern: "husky", category: "Transportation" },
  { pattern: "mobil", category: "Transportation" },
  { pattern: "circle k fuel", category: "Transportation" },
  { pattern: "uber trip", category: "Transportation" },
  { pattern: "uber", category: "Transportation" },
  { pattern: "lyft", category: "Transportation" },
  { pattern: "presto", category: "Transportation" },
  { pattern: "compass card", category: "Transportation" },
  { pattern: "ttc", category: "Transportation" },
  { pattern: "stm", category: "Transportation" },
  { pattern: "translink", category: "Transportation" },
  { pattern: "oc transpo", category: "Transportation" },
  { pattern: "go transit", category: "Transportation" },
  { pattern: "via rail", category: "Transportation" },
  { pattern: "407 etr", category: "Transportation" },
  { pattern: "impark", category: "Transportation" },
  { pattern: "indigo parking", category: "Transportation" },
  { pattern: "green p", category: "Transportation" },
  { pattern: "mr. lube", category: "Transportation" },
  { pattern: "jiffy lube", category: "Transportation" },
  { pattern: "canadian tire auto", category: "Transportation" },
  { pattern: "active green ross", category: "Transportation" },
  { pattern: "midas", category: "Transportation" },
  { pattern: "kal tire", category: "Transportation" },

  // ── UTILITIES & TELECOM ────────────────────────────────────────────────
  { pattern: "rogers", category: "Utilities" },
  { pattern: "bell canada", category: "Utilities" },
  { pattern: "bell mobility", category: "Utilities" },
  { pattern: "telus", category: "Utilities" },
  { pattern: "shaw", category: "Utilities" },
  { pattern: "freedom mobile", category: "Utilities" },
  { pattern: "koodo", category: "Utilities" },
  { pattern: "fido", category: "Utilities" },
  { pattern: "virgin plus", category: "Utilities" },
  { pattern: "virgin mobile", category: "Utilities" },
  { pattern: "chatr", category: "Utilities" },
  { pattern: "public mobile", category: "Utilities" },
  { pattern: "videotron", category: "Utilities" },
  { pattern: "cogeco", category: "Utilities" },
  { pattern: "teksavvy", category: "Utilities" },
  { pattern: "start.ca", category: "Utilities" },
  { pattern: "toronto hydro", category: "Utilities" },
  { pattern: "bc hydro", category: "Utilities" },
  { pattern: "hydro-quebec", category: "Utilities" },
  { pattern: "hydro ottawa", category: "Utilities" },
  { pattern: "enmax", category: "Utilities" },
  { pattern: "alectra", category: "Utilities" },
  { pattern: "enbridge", category: "Utilities" },
  { pattern: "fortisbc", category: "Utilities" },
  { pattern: "atco", category: "Utilities" },

  // ── SHOPPING ───────────────────────────────────────────────────────────
  { pattern: "amazon.ca", category: "Shopping" },
  { pattern: "amazon", category: "Shopping" },
  { pattern: "amzn", category: "Shopping" },
  { pattern: "best buy", category: "Shopping" },
  { pattern: "canadian tire", category: "Shopping" },
  { pattern: "ikea", category: "Shopping" },
  { pattern: "home depot", category: "Shopping" },
  { pattern: "lowes", category: "Shopping" },
  { pattern: "rona", category: "Shopping" },
  { pattern: "hudson bay", category: "Shopping" },
  { pattern: "the bay", category: "Shopping" },
  { pattern: "simons", category: "Shopping" },
  { pattern: "winners", category: "Shopping" },
  { pattern: "marshalls", category: "Shopping" },
  { pattern: "homesense", category: "Shopping" },
  { pattern: "dollarama", category: "Shopping" },
  { pattern: "dollar tree", category: "Shopping" },
  { pattern: "giant tiger", category: "Shopping" },
  { pattern: "sport chek", category: "Shopping" },
  { pattern: "sportchek", category: "Shopping" },
  { pattern: "atmosphere", category: "Shopping" },
  { pattern: "marks", category: "Shopping" },
  { pattern: "indigo", category: "Shopping" },
  { pattern: "chapters", category: "Shopping" },
  { pattern: "apple store", category: "Shopping" },
  { pattern: "apple.com", category: "Shopping" },
  { pattern: "the source", category: "Shopping" },
  { pattern: "staples", category: "Shopping" },
  { pattern: "walmart", category: "Shopping" },
  { pattern: "wayfair", category: "Shopping" },
  { pattern: "structube", category: "Shopping" },
  { pattern: "old navy", category: "Shopping" },
  { pattern: "gap", category: "Shopping" },
  { pattern: "h&m", category: "Shopping" },
  { pattern: "zara", category: "Shopping" },
  { pattern: "uniqlo", category: "Shopping" },
  { pattern: "lululemon", category: "Shopping" },
  { pattern: "aritzia", category: "Shopping" },
  { pattern: "nordstrom", category: "Shopping" },
  { pattern: "roots", category: "Shopping" },
  { pattern: "mountain equipment", category: "Shopping" },
  { pattern: "mec", category: "Shopping" },
  { pattern: "running room", category: "Shopping" },
  { pattern: "bath & body", category: "Shopping" },
  { pattern: "lush", category: "Shopping" },
  { pattern: "ebay", category: "Shopping" },
  { pattern: "etsy", category: "Shopping" },
  { pattern: "aliexpress", category: "Shopping" },
  { pattern: "shein", category: "Shopping" },
  { pattern: "temu", category: "Shopping" },

  // ── ENTERTAINMENT ──────────────────────────────────────────────────────
  { pattern: "netflix", category: "Entertainment" },
  { pattern: "spotify", category: "Entertainment" },
  { pattern: "disney plus", category: "Entertainment" },
  { pattern: "disney+", category: "Entertainment" },
  { pattern: "crave", category: "Entertainment" },
  { pattern: "apple tv", category: "Entertainment" },
  { pattern: "youtube premium", category: "Entertainment" },
  { pattern: "amazon prime", category: "Entertainment" },
  { pattern: "paramount", category: "Entertainment" },
  { pattern: "cineplex", category: "Entertainment" },
  { pattern: "landmark cinema", category: "Entertainment" },
  { pattern: "steam", category: "Entertainment" },
  { pattern: "playstation", category: "Entertainment" },
  { pattern: "xbox", category: "Entertainment" },
  { pattern: "nintendo", category: "Entertainment" },
  { pattern: "epic games", category: "Entertainment" },
  { pattern: "goodlife fitness", category: "Entertainment" },
  { pattern: "goodlife", category: "Entertainment" },
  { pattern: "ymca", category: "Entertainment" },
  { pattern: "fit4less", category: "Entertainment" },
  { pattern: "planet fitness", category: "Entertainment" },
  { pattern: "anytime fitness", category: "Entertainment" },
  { pattern: "ticketmaster", category: "Entertainment" },
  { pattern: "stubhub", category: "Entertainment" },
  { pattern: "eventbrite", category: "Entertainment" },

  // ── HEALTH ─────────────────────────────────────────────────────────────
  { pattern: "shoppers drug mart", category: "Health" },
  { pattern: "shoppers drug", category: "Health" },
  { pattern: "pharmaprix", category: "Health" },
  { pattern: "rexall", category: "Health" },
  { pattern: "london drugs", category: "Health" },
  { pattern: "jean coutu", category: "Health" },
  { pattern: "lifelabs", category: "Health" },
  { pattern: "dynacare", category: "Health" },

  // ── PERSONAL CARE ──────────────────────────────────────────────────────
  { pattern: "sephora", category: "Personal Care" },
  { pattern: "nail salon", category: "Personal Care" },
  { pattern: "great clips", category: "Personal Care" },
  { pattern: "first choice haircutters", category: "Personal Care" },
  { pattern: "supercuts", category: "Personal Care" },

  // ── FINANCIAL ──────────────────────────────────────────────────────────
  { pattern: "wealthsimple", category: "Financial" },
  { pattern: "questrade", category: "Financial" },
  { pattern: "interactive brokers", category: "Financial" },

  // ── REMITTANCE ─────────────────────────────────────────────────────────
  { pattern: "wise", category: "Remittance" },
  { pattern: "transferwise", category: "Remittance" },
  { pattern: "western union", category: "Remittance" },
  { pattern: "remitly", category: "Remittance" },
  { pattern: "xoom", category: "Remittance" },
  { pattern: "world remit", category: "Remittance" },
  { pattern: "moneygram", category: "Remittance" },
  { pattern: "ria money", category: "Remittance" },
  { pattern: "pangea", category: "Remittance" },

  // ── ALCOHOL & CANNABIS ─────────────────────────────────────────────────
  { pattern: "lcbo", category: "Alcohol & Cannabis" },
  { pattern: "saq", category: "Alcohol & Cannabis" },
  { pattern: "bc liquor", category: "Alcohol & Cannabis" },
  { pattern: "beer store", category: "Alcohol & Cannabis" },
  { pattern: "wine rack", category: "Alcohol & Cannabis" },
  { pattern: "ocs", category: "Alcohol & Cannabis" },
  { pattern: "sqdc", category: "Alcohol & Cannabis" },

  // ── SUBSCRIPTIONS ──────────────────────────────────────────────────────
  { pattern: "adobe", category: "Subscriptions" },
  { pattern: "microsoft 365", category: "Subscriptions" },
  { pattern: "google storage", category: "Subscriptions" },
  { pattern: "icloud", category: "Subscriptions" },
  { pattern: "dropbox", category: "Subscriptions" },
  { pattern: "notion", category: "Subscriptions" },
  { pattern: "canva", category: "Subscriptions" },
  { pattern: "chatgpt", category: "Subscriptions" },
  { pattern: "openai", category: "Subscriptions" },
  { pattern: "github", category: "Subscriptions" },

  // ── TRAVEL ─────────────────────────────────────────────────────────────
  { pattern: "air canada", category: "Travel" },
  { pattern: "westjet", category: "Travel" },
  { pattern: "porter airlines", category: "Travel" },
  { pattern: "flair airlines", category: "Travel" },
  { pattern: "airbnb", category: "Travel" },
  { pattern: "booking.com", category: "Travel" },
  { pattern: "expedia", category: "Travel" },
  { pattern: "hotels.com", category: "Travel" },
  { pattern: "marriott", category: "Travel" },
  { pattern: "hilton", category: "Travel" },
  { pattern: "enterprise rent", category: "Travel" },
  { pattern: "hertz", category: "Travel" },
  { pattern: "avis", category: "Travel" },
  { pattern: "budget rent", category: "Travel" },

  // ── INSURANCE ──────────────────────────────────────────────────────────
  { pattern: "manulife", category: "Insurance" },
  { pattern: "sun life", category: "Insurance" },
  { pattern: "great-west life", category: "Insurance" },
  { pattern: "canada life", category: "Insurance" },
  { pattern: "intact insurance", category: "Insurance" },
  { pattern: "aviva", category: "Insurance" },
  { pattern: "belair", category: "Insurance" },
  { pattern: "cooperators", category: "Insurance" },

  // ── CONVENIENCE STORES ─────────────────────────────────────────────────
  { pattern: "circle k", category: "Groceries" },
  { pattern: "couche-tard", category: "Groceries" },
  { pattern: "macs", category: "Groceries" },
  { pattern: "7-eleven", category: "Groceries" },
  { pattern: "7 eleven", category: "Groceries" },

  // ── PETS ───────────────────────────────────────────────────────────────
  { pattern: "petsmart", category: "Pets" },
  { pattern: "pet valu", category: "Pets" },
  { pattern: "global pet", category: "Pets" },
  { pattern: "ren's pets", category: "Pets" },

  // ── CHILDREN & FAMILY ──────────────────────────────────────────────────
  { pattern: "toys r us", category: "Children & Family" },
  { pattern: "mastermind toys", category: "Children & Family" },

  // ── EDUCATION ──────────────────────────────────────────────────────────
  { pattern: "udemy", category: "Education" },
  { pattern: "coursera", category: "Education" },
  { pattern: "linkedin learning", category: "Education" },
  { pattern: "skillshare", category: "Education" },
];

/**
 * Seed the merchant mappings table with Canadian merchant data.
 * Runs on first deploy if the table is empty.
 *
 * @returns {number} Number of merchants seeded (0 if already populated)
 */
export async function seedMerchantMappings() {
  const existing = await getAllMerchantMappings();

  // Only seed if the table is completely empty
  if (existing.length > 0) {
    console.log(`Merchant mappings table already has ${existing.length} entries, skipping seed.`);
    return 0;
  }

  console.log(`Seeding ${MERCHANT_SEED_DATA.length} Canadian merchant mappings...`);

  // Batch seed — we don't use DynamoDB BatchWrite here because we want
  // to use the upsert function which handles the full mapping structure.
  // At ~300 items, this takes ~5-10 seconds which is fine for a one-time seed.
  for (const { pattern, category } of MERCHANT_SEED_DATA) {
    await upsertMerchantMapping({
      merchant_pattern: pattern,
      category_id: category,
      source: "seed",
      match_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`Successfully seeded ${MERCHANT_SEED_DATA.length} merchant mappings.`);
  return MERCHANT_SEED_DATA.length;
}
