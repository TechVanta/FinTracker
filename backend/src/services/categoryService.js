// =============================================================================
// Category Service
// =============================================================================
// Manages the dynamic, admin-controlled spending category system.
//
// Categories are organized in a 2-level hierarchy:
//   - Top-level categories (parent_id = null): "Groceries", "Dining", "Housing"
//   - Subcategories (parent_id = <category_id>): "Supermarket", "Fast Food", "Rent"
//
// Each category carries:
//   - keywords: Used by Layer 2 of the categorization pipeline (keyword matching)
//   - color/icon: Used by the frontend for visual consistency
//   - sort_order: Controls display ordering in the UI
//
// The seed data includes ~20 top-level categories optimized for Canadian spending
// patterns — covering everything from Tim Hortons to Petro-Canada to LCBO.
// =============================================================================

import { v4 as uuidv4 } from "uuid";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deactivateCategory,
} from "../infrastructure/dynamodb.js";

// =============================================================================
// CATEGORY CRUD OPERATIONS
// =============================================================================

/**
 * List all active categories, sorted by sort_order.
 * Used by the frontend dropdown and the categorization pipeline.
 * Optionally includes inactive categories for admin views.
 */
export async function listCategories({ includeInactive = false } = {}) {
  const categories = await getAllCategories();

  const filtered = includeInactive
    ? categories
    : categories.filter((c) => c.is_active !== false);

  // Sort by sort_order, then alphabetically by name as tiebreaker
  return filtered.sort((a, b) => {
    const orderDiff = (a.sort_order || 999) - (b.sort_order || 999);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Create a new category with validation.
 * Generates a UUID, sets timestamps, and stores in DynamoDB.
 *
 * @param {Object} data - Category fields
 * @param {string} data.name - Display name (required)
 * @param {string|null} data.parent_id - Parent category ID, or null for top-level
 * @param {string} data.icon - Icon identifier for the frontend
 * @param {string} data.color - Hex color for charts
 * @param {string[]} data.keywords - Keywords for rule-based matching
 * @param {number} data.sort_order - Display ordering
 */
export async function addCategory(data) {
  const category = {
    category_id: uuidv4(),
    name: data.name,
    parent_id: data.parent_id || null,
    icon: data.icon || "tag",
    color: data.color || "#6B7280",
    keywords: data.keywords || [],
    is_active: true,
    sort_order: data.sort_order ?? 999,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return createCategory(category);
}

/**
 * Update an existing category.
 * Only updates the fields provided — other fields remain unchanged.
 */
export async function editCategory(categoryId, updates) {
  // Validate the category exists
  const existing = await getCategoryById(categoryId);
  if (!existing) {
    const err = new Error("Category not found");
    err.status = 404;
    throw err;
  }

  // Add updated_at timestamp to every update
  updates.updated_at = new Date().toISOString();
  return updateCategory(categoryId, updates);
}

/**
 * Soft-delete a category by marking it inactive.
 * Existing transactions keep their category — they just won't appear in the
 * active category list for new transactions.
 */
export async function removeCategory(categoryId) {
  const existing = await getCategoryById(categoryId);
  if (!existing) {
    const err = new Error("Category not found");
    err.status = 404;
    throw err;
  }
  return deactivateCategory(categoryId);
}

// =============================================================================
// SEED DATA — Canadian-Optimized Default Categories
// =============================================================================
// These categories are loaded on first deploy if the categories table is empty.
// Each category includes keywords that power Layer 2 (keyword matching) of the
// categorization pipeline.
//
// The keywords are intentionally broad and lowercase — the matching logic
// checks if any keyword is a substring of the transaction description.
// More specific merchant-level mappings live in the merchant mapping table.
// =============================================================================

/**
 * Default categories for a Canadian personal finance app.
 * Designed around real Canadian spending patterns with keywords matching
 * the major merchants, chains, and services Canadians use daily.
 */
const DEFAULT_CATEGORIES = [
  {
    name: "Housing",
    icon: "home",
    color: "#8B5CF6",
    sort_order: 1,
    keywords: ["rent", "mortgage", "condo fee", "strata", "property tax", "home insurance", "tenant insurance"],
  },
  {
    name: "Utilities",
    icon: "zap",
    color: "#F59E0B",
    sort_order: 2,
    keywords: [
      "hydro", "electricity", "enbridge", "fortisbc", "atco", "water", "sewer",
      "toronto hydro", "bc hydro", "hydro-qu", "enmax", "alectra",
      "rogers", "bell", "telus", "shaw", "cogeco", "teksavvy", "freedom mobile",
      "koodo", "fido", "virgin plus", "chatr", "public mobile", "videotron",
      "internet", "mobile phone", "wireless",
    ],
  },
  {
    name: "Groceries",
    icon: "shopping-cart",
    color: "#10B981",
    sort_order: 3,
    keywords: [
      "grocery", "supermarket", "loblaws", "no frills", "real canadian superstore",
      "metro", "sobeys", "freshco", "food basics", "save-on-foods", "iga", "maxi",
      "provigo", "farm boy", "longos", "fortinos", "zehrs", "valu-mart",
      "t&t supermarket", "h mart", "whole foods", "walmart supercent",
      "voila", "pc express", "instacart",
      "costco", "wholesale club",
    ],
  },
  {
    name: "Dining",
    icon: "utensils",
    color: "#EF4444",
    sort_order: 4,
    keywords: [
      "restaurant", "tim hortons", "tims", "starbucks", "mcdonald", "a&w",
      "subway", "popeyes", "wendy", "pizza pizza", "boston pizza", "swiss chalet",
      "harvey", "mary brown", "st-hubert", "second cup", "coffee",
      "uber eats", "ubereats", "doordash", "skip the dishes", "skipthedishes",
      "fantuan", "ritual", "dining", "cafe", "bistro", "pub", "grill",
      "sushi", "ramen", "pho", "thai", "burrito", "taco", "pizza", "burger",
      "kfc", "chipotle", "five guys", "dairy queen", "new york fries",
    ],
  },
  {
    name: "Transportation",
    icon: "car",
    color: "#3B82F6",
    sort_order: 5,
    keywords: [
      "petro-canada", "petro canada", "shell", "esso", "canadian tire gas",
      "costco gas", "pioneer", "ultramar", "co-op gas", "husky", "mobil",
      "gas station", "fuel",
      "uber", "lyft",
      "presto", "compass", "ttc", "stm", "translink", "oc transpo",
      "go transit", "via rail", "transit", "bus pass",
      "407 etr", "impark", "indigo parking", "parkopedia", "green p", "parking",
      "mr. lube", "jiffy lube", "canadian tire auto", "auto repair", "car wash",
      "car insurance", "car payment", "car lease",
    ],
  },
  {
    name: "Shopping",
    icon: "shopping-bag",
    color: "#EC4899",
    sort_order: 6,
    keywords: [
      "amazon", "best buy", "canadian tire", "ikea", "home depot", "lowes",
      "hudson bay", "the bay", "simons", "winners", "marshalls", "homesense",
      "dollarama", "dollar tree", "giant tiger",
      "sport chek", "atmosphere", "mark's", "sportchek",
      "indigo", "chapters",
      "apple store", "apple.com",
      "walmart", "the source",
      "wayfair", "structube",
      "old navy", "gap", "h&m", "zara", "uniqlo", "lululemon", "aritzia",
      "nordstrom", "sephora",
    ],
  },
  {
    name: "Entertainment",
    icon: "film",
    color: "#A855F7",
    sort_order: 7,
    keywords: [
      "netflix", "spotify", "disney+", "disney plus", "crave", "apple tv",
      "youtube premium", "amazon prime", "paramount", "hbo",
      "cineplex", "landmark cinema", "imax",
      "steam", "playstation", "xbox", "nintendo", "epic games",
      "goodlife", "ymca", "ywca", "gym", "fitness",
      "ticketmaster", "stubhub", "eventbrite",
      "golf", "bowling", "skating", "ski", "recreation",
    ],
  },
  {
    name: "Health",
    icon: "heart",
    color: "#F43F5E",
    sort_order: 8,
    keywords: [
      "shoppers drug mart", "pharmaprix", "rexall", "london drugs", "pharmacy",
      "dental", "dentist", "optometrist", "optician", "vision", "glasses",
      "therapy", "therapist", "counselling", "psycholog",
      "physiotherapy", "physio", "chiropractic", "massage therapy",
      "medical", "clinic", "doctor", "walk-in",
      "lifelab", "dynacare", "blood test",
    ],
  },
  {
    name: "Children & Family",
    icon: "baby",
    color: "#FB923C",
    sort_order: 9,
    keywords: [
      "daycare", "childcare", "nursery", "preschool",
      "kids", "children", "baby",
      "toys r us", "mastermind toys",
      "kumon", "sylvan", "tutoring", "music lesson", "dance class",
      "school fee", "school supply",
    ],
  },
  {
    name: "Travel",
    icon: "plane",
    color: "#06B6D4",
    sort_order: 10,
    keywords: [
      "air canada", "westjet", "porter", "flair", "swoop", "airline", "flight",
      "airbnb", "booking.com", "expedia", "hotels.com", "marriott", "hilton",
      "car rental", "enterprise", "hertz", "avis", "budget rent",
      "travel insurance", "world nomads",
    ],
  },
  {
    name: "Financial",
    icon: "dollar-sign",
    color: "#14B8A6",
    sort_order: 11,
    keywords: [
      "bank fee", "monthly fee", "account fee", "service charge",
      "credit card interest", "interest charge", "annual fee",
      "overdraft", "nsf fee",
      "td bank", "rbc", "cibc", "bmo", "scotiabank", "desjardins",
      "tangerine", "simplii", "eq bank",
      "wealthsimple", "questrade", "interactive brokers",
      "loan payment", "student loan", "line of credit",
      "tfsa", "rrsp", "resp", "fhsa",
    ],
  },
  {
    name: "Insurance",
    icon: "shield",
    color: "#64748B",
    sort_order: 12,
    keywords: [
      "insurance", "manulife", "sun life", "great-west", "canada life",
      "intact", "aviva", "belair", "cooperators", "desjardins insurance",
      "life insurance", "critical illness", "disability",
      "pet insurance", "trupanion",
    ],
  },
  {
    name: "Personal Care",
    icon: "scissors",
    color: "#D946EF",
    sort_order: 13,
    keywords: [
      "hair", "barber", "salon", "spa", "beauty", "nail",
      "sephora", "shoppers beauty", "bath & body",
      "laundry", "dry clean",
    ],
  },
  {
    name: "Education",
    icon: "book-open",
    color: "#0EA5E9",
    sort_order: 14,
    keywords: [
      "tuition", "university", "college", "school",
      "textbook", "course", "udemy", "coursera", "linkedin learning",
      "certification", "exam fee",
    ],
  },
  {
    name: "Gifts & Donations",
    icon: "gift",
    color: "#E11D48",
    sort_order: 15,
    keywords: [
      "gift", "donation", "charity", "charitable",
      "united way", "red cross", "salvation army",
      "church", "mosque", "temple", "tithe",
    ],
  },
  {
    name: "Pets",
    icon: "paw-print",
    color: "#B45309",
    sort_order: 16,
    keywords: [
      "vet", "veterinar", "pet", "petsmart", "pet valu", "global pet",
      "dog", "cat", "grooming",
    ],
  },
  {
    name: "Remittance",
    icon: "send",
    color: "#7C3AED",
    sort_order: 17,
    keywords: [
      "wise", "transferwise", "western union", "remitly", "xoom",
      "world remit", "moneygram", "ria money", "pangea",
      "remittance", "money transfer",
    ],
  },
  {
    name: "Alcohol & Cannabis",
    icon: "wine",
    color: "#9333EA",
    sort_order: 18,
    keywords: [
      "lcbo", "saq", "bc liquor", "alberta gaming",
      "beer store", "wine rack", "wine",
      "ocs", "sqdc", "cannabis",
    ],
  },
  {
    name: "Subscriptions",
    icon: "repeat",
    color: "#6366F1",
    sort_order: 19,
    keywords: [
      "subscription", "membership", "adobe", "microsoft 365", "google storage",
      "icloud", "dropbox", "notion", "canva",
      "costco membership", "amazon prime", "aaa", "caa",
    ],
  },
  {
    name: "Income",
    icon: "trending-up",
    color: "#22C55E",
    sort_order: 20,
    keywords: [
      "salary", "payroll", "direct deposit", "pay stub",
      "e-transfer received", "etransfer",
      "cra", "tax refund", "gst credit", "ccb", "canada child",
      "ei payment", "oas", "cpp",
      "freelance", "invoice paid",
    ],
  },
  {
    name: "Transfers",
    icon: "arrow-left-right",
    color: "#94A3B8",
    sort_order: 21,
    keywords: [
      "transfer", "payment - thank you", "credit card payment",
      "e-transfer sent", "interac",
      "savings", "chequing",
    ],
  },
  {
    name: "Other",
    icon: "more-horizontal",
    color: "#9CA3AF",
    sort_order: 99,
    keywords: [],
  },
];

/**
 * Seed the categories table with default Canadian spending categories.
 * This runs automatically on first deploy — the app checks if the table
 * is empty and seeds it if so.
 *
 * Safe to call multiple times: it only seeds when the table has 0 categories.
 *
 * @returns {number} Number of categories created (0 if table was already populated)
 */
export async function seedCategories() {
  const existing = await getAllCategories();

  // Only seed if the table is completely empty
  if (existing.length > 0) {
    console.log(`Categories table already has ${existing.length} entries, skipping seed.`);
    return 0;
  }

  console.log(`Seeding ${DEFAULT_CATEGORIES.length} default categories...`);

  for (const data of DEFAULT_CATEGORIES) {
    await addCategory(data);
  }

  console.log(`Successfully seeded ${DEFAULT_CATEGORIES.length} categories.`);
  return DEFAULT_CATEGORIES.length;
}

/**
 * Build a keyword-to-category lookup map from all active categories.
 * Used by Layer 2 (keyword matching) of the categorization pipeline.
 *
 * Returns an array of { keyword, categoryName } pairs sorted by keyword
 * length descending — longer keywords match first to avoid false positives
 * (e.g., "tim hortons" matches before "tim").
 *
 * @returns {Array<{keyword: string, categoryName: string}>}
 */
export async function buildKeywordMap() {
  const categories = await listCategories();

  const pairs = [];
  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;
    for (const kw of cat.keywords) {
      pairs.push({ keyword: kw.toLowerCase(), categoryName: cat.name });
    }
  }

  // Sort by keyword length descending — longer keywords are more specific
  // and should match first (e.g., "tim hortons" before "tim")
  pairs.sort((a, b) => b.keyword.length - a.keyword.length);
  return pairs;
}
