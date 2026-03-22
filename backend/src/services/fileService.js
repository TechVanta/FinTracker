import { v4 as uuidv4 } from "uuid";
import { createFileRecord, getFileById, getFilesByUser, updateFileStatus, createTransactionsBatch } from "../infrastructure/dynamodb.js";
import { generatePresignedUploadUrl, getObject } from "../infrastructure/s3.js";
import { parseCsv, parsePdf } from "./parserService.js";
import { extractFromCsv, extractFromText } from "./extractionService.js";
import { categorizeTransactions } from "../infrastructure/llm.js";

export async function initiateUpload(userId, filename, contentType) {
  const fileId = uuidv4();
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "bin";
  const s3Key = `uploads/${userId}/${fileId}.${ext}`;

  const record = {
    file_id: fileId,
    user_id: userId,
    s3_key: s3Key,
    original_filename: filename,
    file_type: ext,
    status: "PENDING",
    upload_date: new Date().toISOString(),
    transaction_count: 0,
  };

  await createFileRecord(record);
  const uploadUrl = await generatePresignedUploadUrl(s3Key, contentType);

  return { file_id: fileId, upload_url: uploadUrl };
}

export async function processFile(fileId, userId) {
  const file = await getFileById(fileId);
  if (!file || file.user_id !== userId) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }

  await updateFileStatus(fileId, "PROCESSING");

  try {
    console.log(`Processing file ${fileId}: s3_key=${file.s3_key}, type=${file.file_type}`);

    const buffer = await getObject(file.s3_key);
    console.log(`Downloaded ${buffer.length} bytes from S3`);

    let rawTransactions;
    if (file.file_type === "csv") {
      const parsed = parseCsv(buffer);
      console.log(`Parsed CSV: hasHeaders=${parsed.hasHeaders}, rows=${parsed.rows.length}, fields=${parsed.fields?.join(", ") || "none (headerless)"}`);
      rawTransactions = extractFromCsv(parsed);
    } else if (file.file_type === "pdf") {
      const text = await parsePdf(buffer);
      console.log(`Extracted ${text.length} chars from PDF`);
      rawTransactions = extractFromText(text);
    } else {
      throw new Error(`Unsupported file type: ${file.file_type}`);
    }

    console.log(`Extracted ${rawTransactions.length} transactions`);

    if (!rawTransactions.length) {
      const err = new Error("No transactions found in file. Check that your CSV has date, description, and amount columns.");
      err.status = 422;
      throw err;
    }

    const descriptions = rawTransactions.map((t) => t.description);
    const categories = await categorizeTransactions(descriptions);

    const transactions = rawTransactions.map((raw, i) => ({
      transaction_id: uuidv4(),
      user_id: userId,
      date: raw.date,
      description: raw.description,
      amount: raw.amount,
      category: categories[i],
      file_id: fileId,
      created_at: new Date().toISOString(),
    }));

    await createTransactionsBatch(transactions);
    const updated = await updateFileStatus(fileId, "COMPLETED", transactions.length);
    return updated;
  } catch (err) {
    await updateFileStatus(fileId, "FAILED");
    throw err;
  }
}

export async function listFiles(userId) {
  return getFilesByUser(userId);
}
