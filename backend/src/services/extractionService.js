// =============================================================================
// Transaction Extraction Service
// =============================================================================
// Extracts structured transactions (date, description, amount) from parsed
// CSV data and raw PDF text.
//
// This is the most critical piece of the processing pipeline — if extraction
// fails, the user gets no value. The code is intentionally defensive and
// handles many edge cases from real-world Canadian bank/credit card exports:
//
//   - CSV with headers (standard column names)
//   - CSV without headers (detect columns by data type)
//   - CSV with debit/credit split columns (not a single amount column)
//   - CSV from Canadian banks: TD, RBC, CIBC, BMO, Scotia, Desjardins, Tangerine
//   - Date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, M/D/YY, Mon DD YYYY
//   - PDF statements with varied layouts
//
// The column detection algorithm samples rows and scores each column as
// date/amount/text based on the actual data content, not position or headers.
// =============================================================================

// =============================================================================
// DATE DETECTION
// =============================================================================

/** Date patterns we recognize, from most specific to least */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                                       // 2026-03-15 (ISO)
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,                                // 03/15/2026 or 3/15/2026
  /^\d{1,2}\/\d{1,2}\/\d{2}$/,                                // 03/15/26 or 3/15/26
  /^\d{1,2}-\d{1,2}-\d{4}$/,                                  // 03-15-2026
  /^\d{1,2}-\d{1,2}-\d{2}$/,                                  // 03-15-26
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i, // Mar 15, 2026
  /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,   // 15 Mar 2026
  /^\d{8}$/,                                                   // 20260315 (compact)
];

/**
 * Test if a value looks like a date.
 * Accepts many formats commonly found in Canadian bank exports.
 */
function isDate(value) {
  const v = value.trim();
  if (!v || v.length < 6 || v.length > 20) return false;
  return DATE_PATTERNS.some((p) => p.test(v));
}

/**
 * Normalize any recognized date format to ISO YYYY-MM-DD.
 * Canadian banks use a variety of formats, so we handle all of them.
 */
function normalizeDate(dateStr) {
  const s = dateStr.trim();

  // Already ISO: 2026-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Compact: 20260315
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  // MM/DD/YYYY or M/D/YYYY
  const mdyFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyFull) {
    return `${mdyFull[3]}-${mdyFull[1].padStart(2, "0")}-${mdyFull[2].padStart(2, "0")}`;
  }

  // MM/DD/YY or M/D/YY
  const mdyShort = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyShort) {
    const year = parseInt(mdyShort[3]) > 50 ? `19${mdyShort[3]}` : `20${mdyShort[3]}`;
    return `${year}-${mdyShort[1].padStart(2, "0")}-${mdyShort[2].padStart(2, "0")}`;
  }

  // MM-DD-YYYY
  const mdyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    return `${mdyDash[3]}-${mdyDash[1].padStart(2, "0")}-${mdyDash[2].padStart(2, "0")}`;
  }

  // MM-DD-YY
  const mdyDashShort = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (mdyDashShort) {
    const year = parseInt(mdyDashShort[3]) > 50 ? `19${mdyDashShort[3]}` : `20${mdyDashShort[3]}`;
    return `${year}-${mdyDashShort[1].padStart(2, "0")}-${mdyDashShort[2].padStart(2, "0")}`;
  }

  // Fallback: let JavaScript parse it (handles "Mar 15, 2026", "15 Mar 2026", etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return s; // Return as-is if we can't parse it
}

// =============================================================================
// AMOUNT DETECTION
// =============================================================================

/** Pattern for recognizing monetary amounts in a column */
const AMOUNT_RE = /^[($-]*\$?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\)?$/;

/**
 * Test if a value looks like a monetary amount.
 * Handles: $1,234.56, -$45.00, (123.45), 1234.56, 45.00
 */
function isAmount(value) {
  const v = value.trim().replace(/\s/g, "");
  if (!v) return false;
  // Must not be a date
  if (isDate(value)) return false;
  // Must contain at least one digit
  if (!/\d/.test(v)) return false;
  // Test the pattern
  return AMOUNT_RE.test(v);
}

/**
 * Parse a monetary string into a number.
 * Handles currency symbols, commas, parentheses (negative), and whitespace.
 */
function parseAmount(value) {
  if (!value || !String(value).trim()) return 0;
  let s = String(value).trim();

  // Handle parentheses as negative: (123.45) → -123.45
  const isNegative = s.includes("(") && s.includes(")");
  s = s.replace(/[($,\s)]/g, "");

  const num = parseFloat(s) || 0;
  return isNegative ? -Math.abs(num) : num;
}

// =============================================================================
// SKIP DETECTION
// =============================================================================

/** Keywords that indicate summary/total rows we should skip */
const SKIP_KEYWORDS = [
  "balance", "total", "opening", "closing", "statement",
  "minimum payment", "credit limit", "available credit",
  "previous balance", "new balance", "payment due",
  "annual fee", "interest charged",
];

/**
 * Keywords that indicate a payment/credit entry (not a real expense).
 * These are credit card bill payments, refunds, and account credits that
 * appear on statements but should not count as spending.
 */
const PAYMENT_KEYWORDS = [
  "payment - thank you", "payment thank you", "payment received",
  "payment - received", "payment credited", "bill payment",
  "automatic payment", "autopay", "auto payment",
  "credit card payment", "online payment", "payment from",
  "paymt received", "pmt received", "pmt thank you",
];

/**
 * Check if a description looks like a payment/credit entry we should skip.
 * These are credit card bill payments, refunds, etc.
 */
function isPaymentEntry(description) {
  const lower = description.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Check if a description looks like a summary row we should skip.
 */
function shouldSkipRow(description) {
  const lower = description.toLowerCase();
  return SKIP_KEYWORDS.some((kw) => lower.includes(kw));
}

// =============================================================================
// CSV EXTRACTION — Main Entry Point
// =============================================================================

/**
 * Extract transactions from parsed CSV data.
 *
 * Routes to either header-based or headerless extraction depending on
 * whether the parser detected column headers.
 *
 * @param {Object} parsed - Output from parseCsv()
 * @param {Array} parsed.rows - Row data (objects if headers, arrays if headerless)
 * @param {boolean} parsed.hasHeaders - Whether the first row was detected as headers
 * @returns {Array<{date: string, description: string, amount: number}>}
 */
export function extractFromCsv(parsed) {
  const { rows, hasHeaders } = parsed;
  if (!rows || !rows.length) return [];

  if (hasHeaders) {
    return extractWithHeaders(rows);
  }
  return extractWithoutHeaders(rows);
}

// =============================================================================
// HEADER-BASED CSV EXTRACTION
// =============================================================================

/**
 * Extract transactions from a CSV with recognized column headers.
 *
 * Looks for columns by name using an extensive list of common header names
 * from Canadian bank exports. Falls back to type-based detection if the
 * column names don't match any known pattern.
 *
 * Handles:
 *   - Single "amount" column
 *   - Separate "debit" and "credit" columns (common in Canadian bank exports)
 *   - Multiple date columns (transaction date vs posting date — uses first match)
 */
function extractWithHeaders(rows) {
  // Build a lowercase→original header map for case-insensitive matching
  const headers = {};
  for (const key of Object.keys(rows[0])) {
    headers[key.toLowerCase().trim()] = key;
  }

  // Find the columns by name
  const dateCol = findColumn(headers, [
    "date", "transaction date", "posted date", "trans date", "posting date",
    "trans. date", "transaction_date", "txn date", "value date",
  ]);

  const descCol = findColumn(headers, [
    "description", "memo", "details", "narrative", "transaction description",
    "payee", "name", "merchant", "merchant name", "transaction details",
    "activity description", "trans. description",
  ]);

  const amountCol = findColumn(headers, [
    "amount", "total", "value", "transaction amount", "amt",
    "charge amount", "billing amount",
  ]);

  const debitCol = findColumn(headers, [
    "debit", "withdrawal", "debit amount", "money out",
    "withdrawals", "charges", "debit amt",
  ]);

  const creditCol = findColumn(headers, [
    "credit", "deposit", "credit amount", "money in",
    "deposits", "payments", "credit amt", "credits",
  ]);

  // If we can't find date and description by header name,
  // fall back to type-based detection on the values
  if (!dateCol || !descCol) {
    console.log("Header names not recognized, falling back to type-based detection");
    return extractWithoutHeaders(rows.map((row) => Object.values(row)));
  }

  console.log(`Header-based extraction: date="${dateCol}", desc="${descCol}", amount="${amountCol}", debit="${debitCol}", credit="${creditCol}"`);

  const transactions = [];
  for (const row of rows) {
    const rawDate = (row[dateCol] || "").trim();
    const description = (row[descCol] || "").trim();

    // Skip rows with no date or description
    if (!rawDate || !description) continue;

    // Skip summary/total rows
    if (shouldSkipRow(description)) continue;

    // Calculate the amount from either a single column or debit/credit split
    let amount = 0;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
      // In a single amount column, negative values are credits/payments — skip them
      if (amount < 0) continue;
    } else if (debitCol || creditCol) {
      const debit = debitCol ? parseAmount(row[debitCol]) : 0;
      const credit = creditCol ? parseAmount(row[creditCol]) : 0;

      // Skip rows where only the credit column has a value — these are
      // payments (e.g., credit card bill paid via bank transfer) not expenses
      if (Math.abs(credit) > 0 && Math.abs(debit) === 0) continue;

      // Skip rows where debit and credit match — internal balancing entries
      if (Math.abs(debit) > 0 && Math.abs(credit) > 0 && Math.abs(Math.abs(debit) - Math.abs(credit)) < 0.01) continue;

      // Use the debit amount (actual spending)
      amount = debit;
    }

    // Skip rows with no amount (header rows, empty rows)
    if (amount === 0) continue;

    // Skip payment/credit entries (e.g., "PAYMENT - THANK YOU")
    if (isPaymentEntry(description)) continue;

    transactions.push({
      date: normalizeDate(rawDate),
      description,
      amount: Math.abs(amount),
    });
  }

  console.log(`Extracted ${transactions.length} transactions from header-based CSV`);
  return transactions;
}

// =============================================================================
// HEADERLESS CSV EXTRACTION
// =============================================================================

/**
 * Extract transactions from a CSV without headers.
 *
 * This is the smart column detection engine. It samples the first N rows
 * and scores each column as "date", "amount", or "text" based on the actual
 * data content. Then it uses those scores to pick the best column for each role.
 *
 * The algorithm handles common Canadian credit card export formats:
 *   - 3 columns: date, description, amount
 *   - 4 columns: date, description, debit, credit
 *   - 5 columns: transaction date, posting date, description, debit, credit
 *   - 6+ columns: date, reference#, description, extra info, debit, credit
 *
 * Key insight: In a credit card bill, debit amounts (purchases) are much more
 * common and usually larger than credit amounts (refunds/payments). If there
 * are two amount columns, the one with more non-zero values is likely "debit"
 * (the spending column we want to prioritize).
 */
function extractWithoutHeaders(rows) {
  if (!rows.length) return [];

  const numCols = rows[0].length;
  if (numCols < 2) return [];

  // Sample more rows for better accuracy (up to 20)
  const sampleSize = Math.min(20, rows.length);
  const sample = rows.slice(0, sampleSize);

  // ── Score each column by data type ──────────────────────────────────
  const colScores = [];
  for (let col = 0; col < numCols; col++) {
    let dateCount = 0;
    let amountCount = 0;
    let textCount = 0;
    let emptyCount = 0;
    let amountSum = 0;         // Total absolute value of amounts in this column
    let nonZeroAmounts = 0;    // How many non-zero amounts in this column

    for (const row of sample) {
      const val = (row[col] || "").toString().trim();
      if (!val) {
        emptyCount++;
        continue;
      }

      if (isDate(val)) {
        dateCount++;
      } else if (isAmount(val)) {
        amountCount++;
        const parsed = Math.abs(parseAmount(val));
        if (parsed > 0) {
          amountSum += parsed;
          nonZeroAmounts++;
        }
      } else {
        textCount++;
      }
    }

    const total = sampleSize - emptyCount;
    colScores.push({
      col,
      dateScore: total > 0 ? dateCount / total : 0,
      amountScore: total > 0 ? amountCount / total : 0,
      textScore: total > 0 ? textCount / total : 0,
      emptyRate: sampleSize > 0 ? emptyCount / sampleSize : 1,
      amountSum,
      nonZeroAmounts,
      total,
    });
  }

  // Log column scores for debugging
  console.log("Column detection scores:", colScores.map((c, i) =>
    `col${i}: date=${(c.dateScore * 100).toFixed(0)}% amount=${(c.amountScore * 100).toFixed(0)}% text=${(c.textScore * 100).toFixed(0)}% empty=${(c.emptyRate * 100).toFixed(0)}%`
  ).join(", "));

  // ── Pick the best column for each role ──────────────────────────────

  // Date columns: any column with >50% date-like values
  const dateCols = colScores
    .filter((c) => c.dateScore >= 0.5)
    .sort((a, b) => b.dateScore - a.dateScore);

  // Use the first (best) date column — this is typically "transaction date"
  const dateColIdx = dateCols.length > 0 ? dateCols[0].col : -1;

  // Amount columns: any column with >50% amount-like values
  const amountCols = colScores
    .filter((c) => c.amountScore >= 0.5)
    .sort((a, b) => {
      // Sort by non-zero count descending — the column with more non-zero
      // amounts is more likely to be the primary spending column (debit)
      return b.nonZeroAmounts - a.nonZeroAmounts;
    });

  const amountColIndices = amountCols.map((c) => c.col);

  // Text columns: any column with >40% text-like values
  // Pick the one with the most text values (likely the description)
  const textCols = colScores
    .filter((c) => c.textScore >= 0.4 && c.col !== dateColIdx && !amountColIndices.includes(c.col))
    .sort((a, b) => b.textScore - a.textScore);

  const textColIdx = textCols.length > 0 ? textCols[0].col : -1;

  console.log(`Column assignment: date=col${dateColIdx}, text=col${textColIdx}, amounts=[${amountColIndices.join(",")}]`);

  // We need at least an amount column to proceed
  if (amountColIndices.length === 0) {
    console.log("No amount column detected — cannot extract transactions");
    return [];
  }

  // ── Extract transactions using detected columns ─────────────────────
  const transactions = [];
  for (const row of rows) {
    // Get date
    let date = "";
    if (dateColIdx >= 0) {
      date = (row[dateColIdx] || "").toString().trim();
      if (!isDate(date)) continue; // Skip rows without a valid date
    }

    // Get description: use the best text column, or combine all non-date/non-amount columns
    let description = "";
    if (textColIdx >= 0) {
      description = (row[textColIdx] || "").toString().trim();
    } else {
      // Combine all columns that aren't date or amount as the description
      const parts = [];
      for (let i = 0; i < numCols; i++) {
        if (i === dateColIdx || amountColIndices.includes(i)) continue;
        // Skip other date columns (posting date, etc.)
        if (dateCols.some((d) => d.col === i)) continue;
        const val = (row[i] || "").toString().trim();
        if (val && !isAmount(val) && !isDate(val)) parts.push(val);
      }
      description = parts.join(" ").trim();
    }

    if (!description) continue;
    if (shouldSkipRow(description)) continue;

    // Get amount from detected amount columns
    let amount = 0;
    if (amountColIndices.length === 1) {
      // Single amount column: negative values are credits/payments — skip them
      const val = parseAmount((row[amountColIndices[0]] || "").toString());
      if (val < 0) continue;
      amount = val;
    } else if (amountColIndices.length >= 2) {
      // Two amount columns = likely debit/credit split
      // First column (most non-zero values) is debit, second is credit
      const debit = parseAmount((row[amountColIndices[0]] || "").toString());
      const credit = parseAmount((row[amountColIndices[1]] || "").toString());

      // Skip credit-only rows (payments, not expenses)
      if (Math.abs(credit) > 0 && Math.abs(debit) === 0) continue;

      // Skip rows where debit and credit match (balancing entries)
      if (Math.abs(debit) > 0 && Math.abs(credit) > 0 && Math.abs(Math.abs(debit) - Math.abs(credit)) < 0.01) continue;

      amount = debit;
    }

    if (amount === 0) continue;

    // Skip payment/credit entries by description
    if (isPaymentEntry(description)) continue;

    transactions.push({
      date: date ? normalizeDate(date) : new Date().toISOString().slice(0, 10),
      description,
      amount: Math.abs(amount),
    });
  }

  console.log(`Extracted ${transactions.length} transactions from headerless CSV (${rows.length} rows, ${numCols} columns)`);
  return transactions;
}

// =============================================================================
// PDF TEXT EXTRACTION
// =============================================================================

/**
 * Extract transactions from raw text extracted from a PDF statement.
 *
 * PDF statements are messy — text extraction (via pdf-parse) produces
 * unstructured text with inconsistent spacing and line breaks. We use
 * multiple regex strategies to find transaction-like lines:
 *
 *   Strategy 1: "date ... description ... amount" on a single line
 *   Strategy 2: Lines that start with a date, followed by description on
 *               the same or next line, with an amount at the end
 *
 * For credit card PDFs specifically, transactions typically appear as:
 *   "Mar 15  TIM HORTONS #1234  TORONTO ON  $5.67"
 *   "03/15/2026  LOBLAWS 1001  $89.34"
 *
 * @param {string} text - Raw text extracted from PDF
 * @returns {Array<{date: string, description: string, amount: number}>}
 */
export function extractFromText(text) {
  const transactions = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ── Strategy 1: Date + text + amount on a single line ───────────────
  // This catches the most common credit card statement format
  const datePatternStr = DATE_PATTERNS
    .map((p) => p.source.replace(/^\^/, "").replace(/\$$/, ""))
    .join("|");

  // Match: <date> <anything> <dollar amount at end of line>
  const linePattern = new RegExp(
    `^(${datePatternStr})\\s+(.+?)\\s+(-?\\$?\\d{1,3}(?:,\\d{3})*\\.\\d{2})\\s*$`
  );

  // Also try: <date> <anything> <dollar amount not at end> (for multi-column PDFs)
  const loosePattern = new RegExp(
    `(${datePatternStr})\\s+(.{3,50})\\s+(-?\\$?\\d{1,3}(?:,\\d{3})*\\.\\d{2})`
  );

  for (const line of lines) {
    // Try strict pattern first (date at start, amount at end)
    let match = line.match(linePattern);

    // Fall back to loose pattern (amount anywhere after description)
    if (!match) {
      match = line.match(loosePattern);
    }

    if (!match) continue;

    const dateStr = match[1];
    let description = match[2].trim();
    const amountStr = match[3];

    // Clean up description: remove trailing reference numbers, location codes
    description = description
      .replace(/\s{2,}/g, " ")  // Collapse multiple spaces
      .replace(/\s+\d{10,}$/, "")  // Remove trailing reference numbers
      .trim();

    if (!description || description.length < 2) continue;
    if (shouldSkipRow(description)) continue;

    const amount = Math.abs(parseAmount(amountStr));
    if (amount === 0) continue;

    transactions.push({
      date: normalizeDate(dateStr),
      description,
      amount,
    });
  }

  // ── Strategy 2: If Strategy 1 found nothing, try a more aggressive approach ──
  // Some PDFs have the amount on a separate line or use unusual formatting
  if (transactions.length === 0) {
    console.log("Standard PDF extraction found 0 transactions, trying aggressive extraction...");

    // Look for any line containing a date and try to find an amount nearby
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Find a date anywhere in the line
      let dateMatch = null;
      for (const pattern of DATE_PATTERNS) {
        const m = line.match(pattern);
        if (m) { dateMatch = m[0]; break; }
      }
      if (!dateMatch) continue;

      // Find an amount in this line or the next line
      const amountMatch = line.match(/-?\$?\d{1,3}(?:,\d{3})*\.\d{2}/);
      const nextLineAmount = (i + 1 < lines.length)
        ? lines[i + 1].match(/-?\$?\d{1,3}(?:,\d{3})*\.\d{2}/)
        : null;

      const foundAmount = amountMatch || nextLineAmount;
      if (!foundAmount) continue;

      // Extract description: everything between the date and the amount
      let desc = line
        .replace(dateMatch, "")
        .replace(foundAmount[0], "")
        .replace(/\s{2,}/g, " ")
        .trim();

      // If description is too short, use the remaining text
      if (desc.length < 2) continue;
      if (shouldSkipRow(desc)) continue;

      const amount = Math.abs(parseAmount(foundAmount[0]));
      if (amount === 0) continue;

      transactions.push({
        date: normalizeDate(dateMatch),
        description: desc,
        amount,
      });
    }
  }

  console.log(`Extracted ${transactions.length} transactions from PDF text (${lines.length} lines)`);
  return transactions;
}

// =============================================================================
// HEADER MATCHING HELPER
// =============================================================================

/**
 * Find a column by name in the headers map.
 * First tries exact match, then substring match.
 *
 * @param {Object} headers - Map of lowercased header → original header name
 * @param {string[]} candidates - List of possible header names to look for
 * @returns {string|null} The original header name if found, null otherwise
 */
function findColumn(headers, candidates) {
  // Exact match first
  for (const c of candidates) {
    if (headers[c]) return headers[c];
  }
  // Substring match (e.g., "transaction date posted" contains "posted date")
  for (const c of candidates) {
    for (const [lower, original] of Object.entries(headers)) {
      if (lower.includes(c)) return original;
    }
  }
  return null;
}
