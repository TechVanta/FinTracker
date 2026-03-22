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
    const buffer = await getObject(file.s3_key);

    let rawTransactions;
    if (file.file_type === "csv") {
      const rows = parseCsv(buffer);
      rawTransactions = extractFromCsv(rows);
    } else if (file.file_type === "pdf") {
      const text = await parsePdf(buffer);
      rawTransactions = extractFromText(text);
    } else {
      throw new Error(`Unsupported file type: ${file.file_type}`);
    }

    if (!rawTransactions.length) {
      throw new Error("No transactions found in file");
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
