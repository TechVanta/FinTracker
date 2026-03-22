const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i,
];

const AMOUNT_RE = /^-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/;
const AMOUNT_PATTERN = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/;
const SKIP_KEYWORDS = ["balance", "total", "opening", "closing"];

// ─── Header-based extraction ───

export function extractFromCsv(parsed) {
  const { rows, hasHeaders, fields } = parsed;
  if (!rows || !rows.length) return [];

  if (hasHeaders) {
    return extractWithHeaders(rows);
  }
  return extractWithoutHeaders(rows);
}

function extractWithHeaders(rows) {
  const headers = {};
  for (const key of Object.keys(rows[0])) {
    headers[key.toLowerCase().trim()] = key;
  }

  const dateCol = findColumn(headers, ["date", "transaction date", "posted date", "trans date", "posting date"]);
  const descCol = findColumn(headers, ["description", "memo", "details", "narrative", "transaction description", "payee", "name", "merchant"]);
  const amountCol = findColumn(headers, ["amount", "total", "value", "transaction amount"]);
  const debitCol = findColumn(headers, ["debit", "withdrawal", "debit amount", "money out"]);
  const creditCol = findColumn(headers, ["credit", "deposit", "credit amount", "money in"]);

  // If we can't find date and description by name, try type-based detection
  if (!dateCol || !descCol) {
    console.log("Header-based detection failed, falling back to type-based detection");
    return extractWithoutHeaders(rows.map((row) => Object.values(row)));
  }

  const transactions = [];
  for (const row of rows) {
    const date = (row[dateCol] || "").trim();
    const description = (row[descCol] || "").trim();
    if (!date || !description) continue;

    let amount = 0;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    } else if (debitCol || creditCol) {
      const debit = debitCol ? parseAmount(row[debitCol]) : 0;
      const credit = creditCol ? parseAmount(row[creditCol]) : 0;
      amount = debit || credit;
    }

    if (amount === 0) continue;

    transactions.push({
      date: normalizeDate(date),
      description,
      amount: Math.abs(amount),
    });
  }
  return transactions;
}

// ─── Headerless extraction: guess columns by data type ───

function extractWithoutHeaders(rows) {
  if (!rows.length) return [];

  const numCols = rows[0].length;
  if (numCols < 2) return [];

  // Sample first 10 rows to detect column types
  const sample = rows.slice(0, Math.min(10, rows.length));

  // Score each column: date, amount, or text
  const colTypes = [];
  for (let col = 0; col < numCols; col++) {
    let dateScore = 0;
    let amountScore = 0;
    let textScore = 0;
    let total = 0;

    for (const row of sample) {
      const val = (row[col] || "").toString().trim();
      if (!val) continue;
      total++;

      if (isDate(val)) dateScore++;
      else if (isAmount(val)) amountScore++;
      else textScore++;
    }

    if (total === 0) {
      colTypes.push({ type: "unknown", confidence: 0 });
    } else {
      const dateConf = dateScore / total;
      const amountConf = amountScore / total;
      const textConf = textScore / total;

      if (dateConf >= 0.6) colTypes.push({ type: "date", confidence: dateConf });
      else if (amountConf >= 0.6) colTypes.push({ type: "amount", confidence: amountConf });
      else if (textConf >= 0.5) colTypes.push({ type: "text", confidence: textConf });
      else colTypes.push({ type: "unknown", confidence: 0 });
    }
  }

  console.log("Column type detection:", colTypes.map((c, i) => `col${i}=${c.type}(${(c.confidence * 100).toFixed(0)}%)`).join(", "));

  // Pick best column for each type
  const dateColIdx = pickBest(colTypes, "date");
  const amountCols = pickAll(colTypes, "amount");
  const textColIdx = pickBest(colTypes, "text");

  // Need at least a date or text column and an amount column
  if (amountCols.length === 0) {
    console.log("No amount column detected");
    return [];
  }

  const transactions = [];
  for (const row of rows) {
    // Get date
    let date = "";
    if (dateColIdx >= 0) {
      date = (row[dateColIdx] || "").toString().trim();
      if (!isDate(date)) continue;
    }

    // Get description: use text column, or combine non-date non-amount columns
    let description = "";
    if (textColIdx >= 0) {
      description = (row[textColIdx] || "").toString().trim();
    } else {
      // Combine all non-date, non-amount columns as description
      const descParts = [];
      for (let i = 0; i < numCols; i++) {
        if (i !== dateColIdx && !amountCols.includes(i)) {
          const val = (row[i] || "").toString().trim();
          if (val) descParts.push(val);
        }
      }
      description = descParts.join(" ");
    }

    if (!description) continue;
    if (SKIP_KEYWORDS.some((kw) => description.toLowerCase().includes(kw))) continue;

    // Get amount: use the first amount column that has a non-zero value
    let amount = 0;
    for (const colIdx of amountCols) {
      const val = parseAmount((row[colIdx] || "").toString());
      if (val !== 0) {
        amount = val;
        break;
      }
    }

    if (amount === 0) continue;

    transactions.push({
      date: date ? normalizeDate(date) : new Date().toISOString().slice(0, 10),
      description,
      amount: Math.abs(amount),
    });
  }

  return transactions;
}

// ─── Text-based extraction (for PDFs) ───

export function extractFromText(text) {
  const transactions = [];
  const lines = text.split("\n");

  const combinedPattern = new RegExp(
    `(${DATE_PATTERNS.map((p) => p.source.replace(/^\^/, "").replace(/\$$/, "")).join("|")})\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*$`
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(combinedPattern);
    if (!match) continue;

    const dateStr = match[1];
    const description = match[2].trim();
    const amountStr = match[3];

    if (SKIP_KEYWORDS.some((kw) => description.toLowerCase().includes(kw))) continue;

    transactions.push({
      date: normalizeDate(dateStr),
      description,
      amount: Math.abs(parseAmount(amountStr)),
    });
  }
  return transactions;
}

// ─── Helpers ───

function isDate(value) {
  return DATE_PATTERNS.some((p) => p.test(value.trim()));
}

function isAmount(value) {
  return AMOUNT_RE.test(value.trim().replace(/[$,\s]/g, "").replace(/^-/, "")) && !isDate(value);
}

function findColumn(headers, candidates) {
  for (const c of candidates) {
    if (headers[c]) return headers[c];
  }
  for (const c of candidates) {
    for (const [lower, original] of Object.entries(headers)) {
      if (lower.includes(c)) return original;
    }
  }
  return null;
}

function pickBest(colTypes, type) {
  let bestIdx = -1;
  let bestConf = 0;
  for (let i = 0; i < colTypes.length; i++) {
    if (colTypes[i].type === type && colTypes[i].confidence > bestConf) {
      bestConf = colTypes[i].confidence;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function pickAll(colTypes, type) {
  return colTypes
    .map((c, i) => (c.type === type ? i : -1))
    .filter((i) => i >= 0);
}

function parseAmount(value) {
  if (!value || !String(value).trim()) return 0;
  return parseFloat(String(value).replace(/[$,\s]/g, "")) || 0;
}

function normalizeDate(dateStr) {
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const formats = [
    { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, fn: (m) => `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` },
    { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, fn: (m) => `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` },
  ];

  for (const { re, fn } of formats) {
    const m = s.match(re);
    if (m) return fn(m);
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return s;
}
