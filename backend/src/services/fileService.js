// =============================================================================
// File Processing Service
// =============================================================================
// Orchestrates the upload and processing pipeline for all document types:
//   - PDF: Bank/credit card statements (parsed with pdf-parse)
//   - CSV: Exported transaction data (parsed with papaparse)
//   - Image: Receipt photos, banking app screenshots (Groq Vision)
//
// Processing flow:
//   1. User uploads file to S3 via presigned URL (initiated by initiateUpload)
//   2. User triggers processing (processFile)
//   3. Backend fetches file from S3
//   4. Routes to appropriate parser based on file type
//   5. Extracts transactions (date, description, amount)
//   6. Categorizes via the 3-layer pipeline (merchant DB → keywords → LLM)
//   7. Stores transactions in DynamoDB
//   8. Updates file status to COMPLETED
//
// Image processing is new for MVP — it uses Groq Vision (free tier) to
// extract transaction data from receipt photos and banking app screenshots.
// =============================================================================

import { v4 as uuidv4 } from "uuid";
import {
  createFileRecord,
  getFileById,
  getFilesByUser,
  updateFileStatus,
  createTransactionsBatch,
  getTransactionsByFileId,
  deleteTransactionsBatch,
  deleteFileRecord,
} from "../infrastructure/dynamodb.js";
import { generatePresignedUploadUrl, getObject, deleteObject } from "../infrastructure/s3.js";
import { parseCsv, parsePdf } from "./parserService.js";
import { extractFromCsv, extractFromText } from "./extractionService.js";
import { categorizeTransactions } from "../infrastructure/llm.js";

// Supported file types for MVP — PDF and CSV only.
// Image support (Groq Vision) is planned for a future phase.
const SUPPORTED_EXTENSIONS = new Set(["pdf", "csv"]);

// =============================================================================
// UPLOAD INITIATION
// =============================================================================

/**
 * Initiate a file upload by creating a file record and presigned S3 URL.
 *
 * The frontend uses the presigned URL to upload directly to S3, bypassing
 * the Lambda 6MB payload limit. This is critical for images which can be
 * several MB.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {string} filename - Original filename (e.g., "receipt.jpg")
 * @param {string} contentType - MIME type (e.g., "image/jpeg", "text/csv")
 * @returns {Object} { file_id, upload_url }
 */
export async function initiateUpload(userId, filename, contentType) {
  const fileId = uuidv4();
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "bin";
  const s3Key = `uploads/${userId}/${fileId}.${ext}`;

  // Validate supported file types
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `Unsupported file type: .${ext}. Supported: PDF, CSV`
    );
    err.status = 400;
    throw err;
  }

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

// =============================================================================
// FILE PROCESSING
// =============================================================================

/**
 * Process an uploaded file: extract transactions, categorize, and store.
 *
 * This is the main processing pipeline — called when the user clicks
 * "Process" after uploading a file. It handles PDF, CSV, and image files
 * through different extraction paths that all converge on the same
 * categorization and storage logic.
 *
 * @param {string} fileId - The file record ID
 * @param {string} userId - The authenticated user's ID (for ownership check)
 * @returns {Object} Updated file record with transaction count
 */
export async function processFile(fileId, userId) {
  // Verify the file exists and belongs to this user
  const file = await getFileById(fileId);
  if (!file || file.user_id !== userId) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }

  // Mark as processing — the frontend can poll for this status
  await updateFileStatus(fileId, "PROCESSING");

  try {
    console.log(`Processing file ${fileId}: s3_key=${file.s3_key}, type=${file.file_type}`);

    // Download the file from S3
    const buffer = await getObject(file.s3_key);
    console.log(`Downloaded ${buffer.length} bytes from S3`);

    let rawTransactions;

    // ── Route to the appropriate extraction pipeline ──────────────────
    if (file.file_type === "csv") {
      // CSV: Parse columns → extract transactions using smart column detection
      const parsed = parseCsv(buffer);
      rawTransactions = extractFromCsv(parsed);

    } else if (file.file_type === "pdf") {
      // PDF: Extract text → find transactions via regex patterns
      const text = await parsePdf(buffer);
      rawTransactions = extractFromText(text);

    } else {
      throw new Error(`Unsupported file type: ${file.file_type}`);
    }

    console.log(`Extracted ${rawTransactions.length} transactions`);

    // Validate we got at least one transaction
    if (!rawTransactions.length) {
      const err = new Error(
        "No transactions found in file. For images, ensure the receipt or statement is clearly visible."
      );
      err.status = 422;
      throw err;
    }

    // ── Categorize all extracted transactions ─────────────────────────
    // The 3-layer pipeline: merchant DB → keyword rules → LLM fallback
    const descriptions = rawTransactions.map((t) => t.description);
    const categories = await categorizeTransactions(descriptions);

    // ── Build final transaction records ───────────────────────────────
    const transactions = rawTransactions.map((raw, i) => ({
      transaction_id: uuidv4(),
      user_id: userId,
      date: raw.date,
      description: raw.description,
      amount: raw.amount,
      category: categories[i],
      file_id: fileId,
      source: file.file_type,
      created_at: new Date().toISOString(),
    }));

    // ── Store in DynamoDB ─────────────────────────────────────────────
    await createTransactionsBatch(transactions);
    const updated = await updateFileStatus(fileId, "COMPLETED", transactions.length);

    console.log(`Successfully processed ${transactions.length} transactions from ${file.original_filename}`);
    return updated;

  } catch (err) {
    // Mark the file as failed so the user can see what went wrong
    await updateFileStatus(fileId, "FAILED");
    throw err;
  }
}

// =============================================================================
// FILE DELETION
// =============================================================================

/**
 * Delete a file and all its associated transactions.
 *
 * This is the reverse of processFile — it removes all transactions that were
 * extracted from this file, deletes the file from S3, and removes the file
 * record from DynamoDB.
 *
 * @param {string} fileId - The file record ID
 * @param {string} userId - The authenticated user's ID (for ownership check)
 * @returns {Object} { deleted_transactions: number }
 */
export async function deleteFile(fileId, userId) {
  const file = await getFileById(fileId);
  if (!file || file.user_id !== userId) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }

  // Find and delete all transactions from this file
  const transactions = await getTransactionsByFileId(userId, fileId);
  if (transactions.length > 0) {
    const ids = transactions.map((t) => t.transaction_id);
    await deleteTransactionsBatch(ids);
  }

  // Delete the file from S3 (non-critical — don't fail if S3 delete errors)
  try {
    await deleteObject(file.s3_key);
  } catch (err) {
    console.warn(`Failed to delete S3 object ${file.s3_key}:`, err.message);
  }

  // Delete the file record from DynamoDB
  await deleteFileRecord(fileId);

  console.log(`Deleted file ${fileId} (${file.original_filename}) and ${transactions.length} transactions`);
  return { deleted_transactions: transactions.length };
}

// =============================================================================
// FILE LISTING
// =============================================================================

/**
 * List all files uploaded by a user.
 * Used by the frontend to show upload history with processing status.
 */
export async function listFiles(userId) {
  return getFilesByUser(userId);
}
