import Papa from "papaparse";

export function parseCsv(buffer) {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data;
}

export async function parsePdf(buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text;
}
