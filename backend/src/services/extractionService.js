const DATE_PATTERNS = [
  /\d{4}-\d{2}-\d{2}/,
  /\d{1,2}\/\d{1,2}\/\d{2,4}/,
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/,
];

const AMOUNT_PATTERN = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/;

const SKIP_KEYWORDS = ["balance", "total", "opening", "closing"];

export function extractFromCsv(rows) {
  if (!rows.length) return [];

  const headers = {};
  for (const key of Object.keys(rows[0])) {
    headers[key.toLowerCase().trim()] = key;
  }

  const dateCol = findColumn(headers, ["date", "transaction date", "posted date", "trans date"]);
  const descCol = findColumn(headers, ["description", "memo", "details", "narrative", "transaction description"]);
  const amountCol = findColumn(headers, ["amount", "total", "value"]);
  const debitCol = findColumn(headers, ["debit", "withdrawal", "debit amount"]);
  const creditCol = findColumn(headers, ["credit", "deposit", "credit amount"]);

  if (!dateCol || !descCol) return [];

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

    transactions.push({
      date: normalizeDate(date),
      description,
      amount: Math.abs(amount),
    });
  }
  return transactions;
}

export function extractFromText(text) {
  const transactions = [];
  const lines = text.split("\n");

  const combinedPattern = new RegExp(
    `(${DATE_PATTERNS.map((p) => p.source).join("|")})\\s+(.+?)\\s+(${AMOUNT_PATTERN.source})\\s*$`
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
