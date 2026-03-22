import Papa from "papaparse";

export function parseCsv(buffer) {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");

  // First pass: try with headers
  const withHeaders = Papa.parse(text, { header: true, skipEmptyLines: true });

  // Check if the first row looks like real headers (not data)
  if (withHeaders.meta.fields && withHeaders.meta.fields.length > 0) {
    const firstField = withHeaders.meta.fields[0].trim();
    // If the first "header" looks like a date or number, it's probably data, not headers
    if (!looksLikeData(firstField)) {
      return { rows: withHeaders.data, hasHeaders: true, fields: withHeaders.meta.fields };
    }
  }

  // Second pass: no headers (the file is headerless)
  const noHeaders = Papa.parse(text, { header: false, skipEmptyLines: true });
  return { rows: noHeaders.data, hasHeaders: false, fields: null };
}

function looksLikeData(value) {
  // Looks like a date
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  // Looks like a number/amount
  if (/^-?\$?\d+[\d,.]*$/.test(value)) return true;
  return false;
}

export async function parsePdf(buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text;
}
