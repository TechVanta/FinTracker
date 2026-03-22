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
    subcategories: [
      { name: "Rent / Mortgage", icon: "home", color: "#7C3AED", keywords: ["rent", "mortgage", "condo fee", "strata"] },
      { name: "Property Tax", icon: "landmark", color: "#6D28D9", keywords: ["property tax", "municipal tax"] },
      { name: "Home Maintenance", icon: "wrench", color: "#5B21B6", keywords: ["plumber", "electrician", "home repair", "handyman", "renovation", "home hardware"] },
      { name: "Furniture & Decor", icon: "sofa", color: "#4C1D95", keywords: ["ikea", "structube", "wayfair", "furniture", "home decor", "mattress"] },
    ],
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
    subcategories: [
      { name: "Electricity & Gas", icon: "zap", color: "#D97706", keywords: ["hydro", "electricity", "enbridge", "fortisbc", "atco", "toronto hydro", "bc hydro", "enmax", "alectra"] },
      { name: "Water & Sewer", icon: "droplet", color: "#B45309", keywords: ["water", "sewer", "water utility"] },
      { name: "Internet & Phone", icon: "wifi", color: "#92400E", keywords: ["rogers", "bell", "telus", "shaw", "cogeco", "teksavvy", "freedom mobile", "koodo", "fido", "internet", "mobile phone", "wireless"] },
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
    subcategories: [
      { name: "Produce", icon: "apple", color: "#059669", keywords: ["produce", "fruit", "vegetable", "organic produce", "farm boy"] },
      { name: "Dairy & Eggs", icon: "egg", color: "#047857", keywords: ["dairy", "milk", "cheese", "yogurt", "eggs"] },
      { name: "Meat & Seafood", icon: "beef", color: "#065F46", keywords: ["meat", "chicken", "beef", "pork", "fish", "seafood", "butcher"] },
      { name: "Packaged Foods", icon: "package", color: "#064E3B", keywords: ["packaged food", "snack", "cereal", "canned", "frozen food"] },
      { name: "Bakery", icon: "cake", color: "#0D9488", keywords: ["bakery", "bread", "pastry", "cake"] },
      { name: "Beverages", icon: "cup-soda", color: "#0F766E", keywords: ["beverage", "juice", "pop", "soda", "water bottle"] },
      { name: "Household Supplies", icon: "spray-can", color: "#115E59", keywords: ["cleaning", "paper towel", "toilet paper", "detergent", "household"] },
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
    subcategories: [
      { name: "Coffee & Cafe", icon: "coffee", color: "#DC2626", keywords: ["tim hortons", "tims", "starbucks", "second cup", "coffee", "cafe", "tea"] },
      { name: "Fast Food", icon: "hamburger", color: "#B91C1C", keywords: ["mcdonald", "a&w", "subway", "popeyes", "wendy", "kfc", "burger king", "pizza pizza", "harvey", "dairy queen", "new york fries", "five guys", "chipotle"] },
      { name: "Restaurants", icon: "utensils", color: "#991B1B", keywords: ["restaurant", "bistro", "pub", "grill", "boston pizza", "swiss chalet", "st-hubert", "dining"] },
      { name: "Food Delivery", icon: "truck", color: "#7F1D1D", keywords: ["uber eats", "ubereats", "doordash", "skip the dishes", "skipthedishes", "fantuan", "ritual"] },
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
    subcategories: [
      { name: "Gas & Fuel", icon: "fuel", color: "#2563EB", keywords: ["petro-canada", "petro canada", "shell", "esso", "costco gas", "pioneer", "ultramar", "gas station", "fuel"] },
      { name: "Public Transit", icon: "train", color: "#1D4ED8", keywords: ["presto", "compass", "ttc", "stm", "translink", "oc transpo", "go transit", "via rail", "transit", "bus pass"] },
      { name: "Ride Share & Taxi", icon: "car-taxi", color: "#1E40AF", keywords: ["uber", "lyft", "taxi", "cab"] },
      { name: "Parking & Tolls", icon: "square-parking", color: "#1E3A8A", keywords: ["407 etr", "impark", "indigo parking", "green p", "parking", "toll"] },
      { name: "Car Maintenance", icon: "wrench", color: "#172554", keywords: ["mr. lube", "jiffy lube", "auto repair", "car wash", "oil change", "tire"] },
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
    subcategories: [
      { name: "Clothing & Fashion", icon: "shirt", color: "#DB2777", keywords: ["old navy", "gap", "h&m", "zara", "uniqlo", "lululemon", "aritzia", "nordstrom", "winners", "marshalls", "simons", "hudson bay", "the bay"] },
      { name: "Electronics", icon: "monitor", color: "#BE185D", keywords: ["best buy", "apple store", "apple.com", "the source", "electronics"] },
      { name: "Home Improvement", icon: "hammer", color: "#9D174D", keywords: ["home depot", "lowes", "canadian tire", "rona", "home hardware"] },
      { name: "Online Shopping", icon: "globe", color: "#831843", keywords: ["amazon", "walmart.ca", "online order"] },
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
    subcategories: [
      { name: "Streaming", icon: "tv", color: "#9333EA", keywords: ["netflix", "spotify", "disney+", "disney plus", "crave", "apple tv", "youtube premium", "amazon prime", "paramount", "hbo"] },
      { name: "Movies & Theatre", icon: "film", color: "#7E22CE", keywords: ["cineplex", "landmark cinema", "imax", "movie", "theatre"] },
      { name: "Gaming", icon: "gamepad", color: "#6B21A8", keywords: ["steam", "playstation", "xbox", "nintendo", "epic games", "gaming"] },
      { name: "Sports & Fitness", icon: "dumbbell", color: "#581C87", keywords: ["goodlife", "ymca", "ywca", "gym", "fitness", "golf", "bowling", "skating", "ski", "recreation"] },
      { name: "Events & Concerts", icon: "ticket", color: "#4C1D95", keywords: ["ticketmaster", "stubhub", "eventbrite", "concert", "event", "festival"] },
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
    subcategories: [
      { name: "Pharmacy", icon: "pill", color: "#E11D48", keywords: ["shoppers drug mart", "pharmaprix", "rexall", "london drugs", "pharmacy", "prescription"] },
      { name: "Dental & Vision", icon: "eye", color: "#BE123C", keywords: ["dental", "dentist", "optometrist", "optician", "vision", "glasses", "contacts"] },
      { name: "Mental Health", icon: "brain", color: "#9F1239", keywords: ["therapy", "therapist", "counselling", "psycholog", "mental health"] },
      { name: "Medical & Specialists", icon: "stethoscope", color: "#881337", keywords: ["medical", "clinic", "doctor", "walk-in", "specialist", "physiotherapy", "physio", "chiropractic", "massage therapy"] },
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
    subcategories: [
      { name: "Flights", icon: "plane", color: "#0891B2", keywords: ["air canada", "westjet", "porter", "flair", "swoop", "airline", "flight"] },
      { name: "Accommodation", icon: "bed", color: "#0E7490", keywords: ["airbnb", "booking.com", "expedia", "hotels.com", "marriott", "hilton", "hotel", "motel"] },
      { name: "Car Rental", icon: "car", color: "#155E75", keywords: ["car rental", "enterprise", "hertz", "avis", "budget rent"] },
    ],
  },
  {
    name: "Investment",
    icon: "trending-up",
    color: "#059669",
    sort_order: 11,
    keywords: [
      "wealthsimple", "questrade", "interactive brokers", "td direct investing",
      "rbc direct", "bmo investorline", "cibc investor",
      "etf", "stock", "mutual fund", "gic",
      "crypto", "bitcoin", "coinbase", "newton", "shakepay", "bitbuy",
    ],
    subcategories: [
      { name: "Stocks & ETFs", icon: "bar-chart", color: "#047857", keywords: ["stock", "etf", "mutual fund", "gic", "questrade", "wealthsimple trade", "td direct investing"] },
      { name: "RRSP", icon: "piggy-bank", color: "#065F46", keywords: ["rrsp", "retirement", "registered retirement"] },
      { name: "TFSA", icon: "shield-check", color: "#064E3B", keywords: ["tfsa", "tax-free savings"] },
      { name: "RESP / FHSA", icon: "graduation-cap", color: "#14532D", keywords: ["resp", "fhsa", "education savings", "first home savings"] },
      { name: "Crypto", icon: "bitcoin", color: "#166534", keywords: ["crypto", "bitcoin", "coinbase", "newton", "shakepay", "bitbuy", "ethereum"] },
    ],
  },
  {
    name: "Financial",
    icon: "dollar-sign",
    color: "#14B8A6",
    sort_order: 12,
    keywords: [
      "bank fee", "monthly fee", "account fee", "service charge",
      "credit card interest", "interest charge", "annual fee",
      "overdraft", "nsf fee",
      "td bank", "rbc", "cibc", "bmo", "scotiabank", "desjardins",
      "tangerine", "simplii", "eq bank",
      "loan payment", "student loan", "line of credit",
    ],
  },
  {
    name: "Insurance",
    icon: "shield",
    color: "#64748B",
    sort_order: 13,
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
    sort_order: 14,
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
    sort_order: 15,
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
    sort_order: 16,
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
    sort_order: 17,
    keywords: [
      "vet", "veterinar", "pet", "petsmart", "pet valu", "global pet",
      "dog", "cat", "grooming",
    ],
  },
  {
    name: "Remittance",
    icon: "send",
    color: "#7C3AED",
    sort_order: 18,
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
    sort_order: 19,
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
    sort_order: 20,
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
    sort_order: 21,
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
    sort_order: 22,
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
 * Creates parent categories first, then subcategories with correct parent_id
 * references. Safe to call multiple times: it only seeds when the table has
 * 0 categories.
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

  let count = 0;
  console.log(`Seeding ${DEFAULT_CATEGORIES.length} default categories with subcategories...`);

  for (const data of DEFAULT_CATEGORIES) {
    // Create the parent category (without subcategories field)
    const { subcategories, ...parentData } = data;
    const parent = await addCategory(parentData);
    count++;

    // Create subcategories with parent_id reference
    if (subcategories && subcategories.length > 0) {
      for (let i = 0; i < subcategories.length; i++) {
        await addCategory({
          ...subcategories[i],
          parent_id: parent.category_id,
          sort_order: data.sort_order * 100 + i + 1,
        });
        count++;
      }
    }
  }

  console.log(`Successfully seeded ${count} categories (parents + subcategories).`);
  return count;
}

/**
 * Add subcategories to existing parent categories that don't have them yet.
 * Use this on deployments that were seeded before subcategories were added.
 *
 * Matches parents by name and only creates subcategories that don't already exist.
 *
 * @returns {number} Number of subcategories added
 */
export async function seedSubcategories() {
  const existing = await getAllCategories();
  const existingNames = new Set(existing.map((c) => c.name));
  const parentsByName = Object.fromEntries(
    existing.filter((c) => !c.parent_id).map((c) => [c.name, c])
  );

  let count = 0;

  for (const data of DEFAULT_CATEGORIES) {
    if (!data.subcategories || data.subcategories.length === 0) continue;

    const parent = parentsByName[data.name];
    if (!parent) continue; // Parent doesn't exist — skip

    for (let i = 0; i < data.subcategories.length; i++) {
      const sub = data.subcategories[i];
      if (existingNames.has(sub.name)) continue; // Already exists

      await addCategory({
        ...sub,
        parent_id: parent.category_id,
        sort_order: (data.sort_order || 999) * 100 + i + 1,
      });
      count++;
    }
  }

  // Also add any new parent categories (like Investment) that don't exist yet
  for (const data of DEFAULT_CATEGORIES) {
    if (existingNames.has(data.name)) continue;

    const { subcategories, ...parentData } = data;
    const parent = await addCategory(parentData);
    count++;

    if (subcategories && subcategories.length > 0) {
      for (let i = 0; i < subcategories.length; i++) {
        await addCategory({
          ...subcategories[i],
          parent_id: parent.category_id,
          sort_order: (data.sort_order || 999) * 100 + i + 1,
        });
        count++;
      }
    }
  }

  console.log(`Added ${count} new subcategories/categories.`);
  return count;
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
