// =============================================================================
// File Parser Service
// =============================================================================
// Parses raw file buffers into structured data that the extraction service
// can work with.
//
// CSV parsing:
//   - Auto-detects whether the first row is a header or data
//   - Handles BOM (byte order mark) from Excel exports
//   - Handles various delimiters (comma, semicolon, tab — auto-detected by papaparse)
//   - Handles quoted fields with commas inside them
//
// PDF parsing:
//   - Extracts raw text from all pages using pdf-parse
//   - Returns the text for the extraction service to process with regex
//
// Both parsers are intentionally simple — they just get the data into a
// workable format. The smart logic lives in extractionService.js.
// =============================================================================

import Papa from "papaparse";

/**
 * Parse a CSV file buffer into rows.
 *
 * The tricky part is detecting whether the first row is a header or data.
 * Many Canadian bank CSV exports have no headers — they just start with data:
 *   03/15/2026,TIM HORTONS #1234,5.67
 *   03/14/2026,LOBLAWS 1001,89.34
 *
 * Our detection heuristic:
 *   1. Parse with headers first
 *   2. Check if the first field looks like actual data (a date or number)
 *   3. If it looks like data, re-parse without headers
 *
 * @param {Buffer} buffer - Raw CSV file content
 * @returns {Object} { rows, hasHeaders, fields }
 */
export function parseCsv(buffer) {
  // Convert buffer to string, strip BOM (common in Excel-exported CSVs)
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "").trim();

  if (!text) {
    return { rows: [], hasHeaders: false, fields: null };
  }

  // First pass: try parsing with headers enabled
  const withHeaders = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  // Check if the detected "headers" actually look like headers or data
  if (withHeaders.meta.fields && withHeaders.meta.fields.length > 0) {
    const firstField = withHeaders.meta.fields[0].trim();

    // If the first "header" looks like a date, number, or is empty,
    // the file probably doesn't have headers
    if (!looksLikeHeader(firstField)) {
      console.log(`First field "${firstField}" looks like data, not a header — re-parsing as headerless`);
      const noHeaders = Papa.parse(text, { header: false, skipEmptyLines: true });
      return { rows: noHeaders.data, hasHeaders: false, fields: null };
    }

    // Headers detected — filter out completely empty rows
    const validRows = withHeaders.data.filter((row) => {
      const values = Object.values(row);
      return values.some((v) => v && String(v).trim() !== "");
    });

    console.log(`CSV parsed with headers: ${withHeaders.meta.fields.length} columns, ${validRows.length} rows`);
    return { rows: validRows, hasHeaders: true, fields: withHeaders.meta.fields };
  }

  // No headers detected — parse as a flat array of arrays
  const noHeaders = Papa.parse(text, { header: false, skipEmptyLines: true });
  console.log(`CSV parsed without headers: ${noHeaders.data[0]?.length || 0} columns, ${noHeaders.data.length} rows`);
  return { rows: noHeaders.data, hasHeaders: false, fields: null };
}

/**
 * Check if a value looks like a column header (text label) rather than data.
 *
 * Returns true if the value is likely a header name.
 * Returns false if the value looks like actual data (date, number, amount).
 *
 * This is the key heuristic for auto-detecting headerless CSVs.
 */
function looksLikeHeader(value) {
  if (!value) return false;
  const v = value.trim();

  // Looks like a date → it's data, not a header
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(v)) return false;
  if (/^\d{8}$/.test(v)) return false;

  // Looks like a number/amount → it's data, not a header
  if (/^-?\$?\d+[\d,.]*$/.test(v)) return false;

  // Looks like a date with month name → it's data, not a header
  if (/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(v) && /\d/.test(v)) return false;

  // If it's purely alphabetic or contains common header words, it's a header
  return true;
}

/**
 * Parse a PDF file buffer into raw text.
 *
 * Uses pdf-parse to extract text from all pages. The quality of extraction
 * depends on the PDF structure — some banks produce well-structured PDFs
 * (text is selectable), while others are basically images (need OCR).
 *
 * For image-based PDFs, this will return very little text, and the
 * extraction service will find 0 transactions. That's expected behavior
 * for MVP — we'll add Textract support later for these cases.
 *
 * @param {Buffer} buffer - Raw PDF file content
 * @returns {string} Extracted text from all pages
 */
export async function parsePdf(buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  console.log(`PDF parsed: ${result.numpages} pages, ${result.text.length} chars extracted`);
  return result.text;
}
