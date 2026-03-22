// =============================================================================
// DynamoDB Data Access Layer
// =============================================================================
// This is the SINGLE abstraction layer for all DynamoDB operations in FinTracker.
// Every database read/write in the application goes through this file.
//
// WHY THIS MATTERS:
// When we eventually migrate from DynamoDB to PostgreSQL (planned for Phase 2-3),
// we only need to replace the internals of this file — no changes to routes,
// services, or business logic. Keep it that way: never use raw DynamoDB SDK
// calls outside this file.
//
// Tables:
//   1. fintracker-users              — User accounts
//   2. fintracker-transactions       — Financial transactions
//   3. fintracker-files              — Uploaded document tracking
//   4. fintracker-categories         — Dynamic spending categories (admin-managed)
//   5. fintracker-merchant-mappings  — Merchant → category lookup cache
// =============================================================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import config from "../config.js";

// Initialize DynamoDB client with the configured AWS region.
// In Lambda, credentials come from the execution role automatically.
// In local dev, credentials come from AWS CLI profile or environment variables.
const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client);

// =============================================================================
// USERS
// =============================================================================

/**
 * Create a new user account.
 * Uses a condition expression to prevent duplicate user_ids (belt-and-suspenders
 * since we generate UUIDs, but protects against accidental retry).
 */
export async function createUser(user) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.usersTable,
    Item: user,
    ConditionExpression: "attribute_not_exists(user_id)",
  }));
  return user;
}

/**
 * Look up a user by email address using the EmailIndex GSI.
 * Used during login to find the user record and verify their password.
 * Returns null if no user exists with that email.
 */
export async function getUserByEmail(email) {
  const result = await docClient.send(new QueryCommand({
    TableName: config.dynamodb.usersTable,
    IndexName: "EmailIndex",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: { ":email": email },
  }));
  return result.Items?.[0] || null;
}

// =============================================================================
// TRANSACTIONS
// =============================================================================

/**
 * Batch-write transactions extracted from an uploaded document.
 * DynamoDB limits batch writes to 25 items, so we chunk accordingly.
 * Used by the file processing pipeline after extraction + categorization.
 */
export async function createTransactionsBatch(transactions) {
  const BATCH_SIZE = 25;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [config.dynamodb.transactionsTable]: batch.map((txn) => ({
          PutRequest: { Item: txn },
        })),
      },
    }));
  }
}

/**
 * Create a single transaction record.
 * Used for manual transaction entry (user adds a cash expense, etc.).
 */
export async function createTransaction(transaction) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.transactionsTable,
    Item: transaction,
  }));
  return transaction;
}

/**
 * Query transactions for a specific user within an optional date range and category.
 * Uses the UserDateIndex GSI for efficient per-user queries sorted by date.
 *
 * Handles DynamoDB pagination automatically — if the result set exceeds 1MB,
 * we follow LastEvaluatedKey to fetch all pages.
 *
 * @param {string} userId - The user's ID
 * @param {string} [startDate] - Start of date range (YYYY-MM-DD), inclusive
 * @param {string} [endDate] - End of date range (YYYY-MM-DD), exclusive
 * @param {string} [category] - Optional category filter (applied as FilterExpression)
 */
export async function getTransactionsByUser(userId, startDate, endDate, category) {
  let keyExpr = "user_id = :uid";
  const exprValues = { ":uid": userId };
  const exprNames = {};

  // Add date range to the key condition (uses the GSI range key)
  if (startDate && endDate) {
    keyExpr += " AND #d BETWEEN :start AND :end";
    exprValues[":start"] = startDate;
    exprValues[":end"] = endDate;
    exprNames["#d"] = "date";
  }

  const params = {
    TableName: config.dynamodb.transactionsTable,
    IndexName: "UserDateIndex",
    KeyConditionExpression: keyExpr,
    ExpressionAttributeValues: exprValues,
  };

  if (Object.keys(exprNames).length > 0) {
    params.ExpressionAttributeNames = exprNames;
  }

  // Category filter is a FilterExpression (applied after the query, not in the index)
  // because category is not part of the key schema
  if (category) {
    params.FilterExpression = "category = :cat";
    exprValues[":cat"] = category;
  }

  // Paginate through all results — DynamoDB returns max 1MB per query
  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Update specific fields on a transaction record.
 * Used when a user corrects a transaction's category — the auto-learning
 * system then feeds this correction into the merchant mapping table.
 *
 * @param {string} transactionId - The transaction to update
 * @param {Object} updates - Key-value pairs to update (e.g., { category: "Dining" })
 * @returns {Object} The full updated transaction record
 */
export async function updateTransaction(transactionId, updates) {
  const exprParts = [];
  const exprValues = {};
  const exprNames = {};
  let i = 0;

  for (const [key, value] of Object.entries(updates)) {
    exprParts.push(`#a${i} = :v${i}`);
    exprNames[`#a${i}`] = key;
    exprValues[`:v${i}`] = value;
    i++;
  }

  const result = await docClient.send(new UpdateCommand({
    TableName: config.dynamodb.transactionsTable,
    Key: { transaction_id: transactionId },
    UpdateExpression: "SET " + exprParts.join(", "),
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes;
}

/**
 * Delete a single transaction by ID.
 * Returns the deleted item so the caller can confirm what was removed.
 */
export async function deleteTransaction(transactionId) {
  const result = await docClient.send(new DeleteCommand({
    TableName: config.dynamodb.transactionsTable,
    Key: { transaction_id: transactionId },
    ReturnValues: "ALL_OLD",
  }));
  return result.Attributes || null;
}

/**
 * Get a single transaction by ID.
 * Used to verify ownership before allowing updates or deletes.
 */
export async function getTransactionById(transactionId) {
  const result = await docClient.send(new GetCommand({
    TableName: config.dynamodb.transactionsTable,
    Key: { transaction_id: transactionId },
  }));
  return result.Item || null;
}

// =============================================================================
// FILES
// =============================================================================

/**
 * Create a file record when a user initiates an upload.
 * The record starts with status "PENDING" and is updated as processing progresses.
 */
export async function createFileRecord(record) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.filesTable,
    Item: record,
  }));
  return record;
}

/**
 * Get a single file record by ID.
 * Used to check file ownership and status before processing.
 */
export async function getFileById(fileId) {
  const result = await docClient.send(new GetCommand({
    TableName: config.dynamodb.filesTable,
    Key: { file_id: fileId },
  }));
  return result.Item || null;
}

/**
 * List all files uploaded by a specific user, sorted by upload date.
 * Uses the UserIndex GSI for efficient per-user listing.
 */
export async function getFilesByUser(userId) {
  const result = await docClient.send(new QueryCommand({
    TableName: config.dynamodb.filesTable,
    IndexName: "UserIndex",
    KeyConditionExpression: "user_id = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  }));
  return result.Items || [];
}

/**
 * Update a file's processing status and transaction count.
 * Called during the processing pipeline:
 *   PENDING → PROCESSING → COMPLETED (with count) or FAILED
 */
export async function updateFileStatus(fileId, status, transactionCount = 0) {
  const result = await docClient.send(new UpdateCommand({
    TableName: config.dynamodb.filesTable,
    Key: { file_id: fileId },
    UpdateExpression: "SET #s = :status, transaction_count = :count",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": status, ":count": transactionCount },
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes;
}

// =============================================================================
// CATEGORIES
// =============================================================================
// Dynamic spending categories managed by the admin. Replaces the old hardcoded
// CATEGORIES array with a flexible, database-driven system.
//
// Category structure:
//   - category_id: UUID
//   - name: Display name (e.g., "Groceries")
//   - parent_id: null for top-level, category_id for subcategory
//   - icon: Icon identifier for the frontend (e.g., "shopping-cart")
//   - color: Hex color for charts (e.g., "#4CAF50")
//   - keywords: Array of keywords for rule-based matching (Layer 2)
//   - is_active: Boolean for soft-delete
//   - sort_order: Number for display ordering
//   - created_at / updated_at: ISO timestamps
// =============================================================================

/**
 * Create a new spending category.
 * Called by the admin API and by the seed script during initial setup.
 */
export async function createCategory(category) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.categoriesTable,
    Item: category,
  }));
  return category;
}

/**
 * Get all categories from the table.
 * Uses a Scan because the categories table is small (~20-50 items) and we
 * need the full list for the categorization pipeline and frontend dropdown.
 *
 * At this scale, Scan is more efficient than maintaining a GSI — the entire
 * table fits in a single 1MB page.
 */
export async function getAllCategories() {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: config.dynamodb.categoriesTable };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * Get a single category by ID.
 * Used for validation when assigning categories to transactions.
 */
export async function getCategoryById(categoryId) {
  const result = await docClient.send(new GetCommand({
    TableName: config.dynamodb.categoriesTable,
    Key: { category_id: categoryId },
  }));
  return result.Item || null;
}

/**
 * Update specific fields on a category.
 * Used by admin to rename categories, change colors, update keywords, etc.
 *
 * @param {string} categoryId - The category to update
 * @param {Object} updates - Key-value pairs to update
 * @returns {Object} The full updated category record
 */
export async function updateCategory(categoryId, updates) {
  const exprParts = [];
  const exprValues = {};
  const exprNames = {};
  let i = 0;

  for (const [key, value] of Object.entries(updates)) {
    exprParts.push(`#a${i} = :v${i}`);
    exprNames[`#a${i}`] = key;
    exprValues[`:v${i}`] = value;
    i++;
  }

  const result = await docClient.send(new UpdateCommand({
    TableName: config.dynamodb.categoriesTable,
    Key: { category_id: categoryId },
    UpdateExpression: "SET " + exprParts.join(", "),
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes;
}

/**
 * Soft-delete a category by setting is_active to false.
 * We never hard-delete categories because existing transactions reference them.
 */
export async function deactivateCategory(categoryId) {
  return updateCategory(categoryId, {
    is_active: false,
    updated_at: new Date().toISOString(),
  });
}

// =============================================================================
// MERCHANT MAPPINGS
// =============================================================================
// The merchant mapping table is Layer 1 of the 3-layer categorization pipeline.
// It maps normalized merchant names (lowercase, trimmed) to category names.
//
// This table grows organically through three sources:
//   1. Seed data — ~500 pre-loaded Canadian merchants
//   2. Admin additions — manual merchant → category mappings
//   3. Auto-learning — user category corrections are saved here
//   4. LLM cache — when the LLM categorizes an unknown merchant, the result
//      is saved here so the same merchant is never sent to the LLM again
//
// Mapping structure:
//   - merchant_pattern: Normalized merchant name (PK)
//   - category_id: The category name this merchant maps to
//   - source: "seed" | "admin" | "user_correction" | "llm_cache"
//   - match_count: How many times this mapping has been used (for analytics)
//   - created_at / updated_at: ISO timestamps
// =============================================================================

/**
 * Create or overwrite a merchant → category mapping.
 * Used by the seed script, admin API, and auto-learning system.
 */
export async function upsertMerchantMapping(mapping) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.merchantsTable,
    Item: mapping,
  }));
  return mapping;
}

/**
 * Look up a merchant mapping by normalized pattern.
 * This is the hot path of the categorization pipeline — called for every
 * transaction. Returns null if no mapping exists (falls through to Layer 2).
 */
export async function getMerchantMapping(merchantPattern) {
  const result = await docClient.send(new GetCommand({
    TableName: config.dynamodb.merchantsTable,
    Key: { merchant_pattern: merchantPattern },
  }));
  return result.Item || null;
}

/**
 * Increment the match_count on a merchant mapping.
 * Called each time a mapping is successfully used to categorize a transaction.
 * This helps identify the most-used mappings and informs admin decisions.
 */
export async function incrementMerchantMatchCount(merchantPattern) {
  try {
    await docClient.send(new UpdateCommand({
      TableName: config.dynamodb.merchantsTable,
      Key: { merchant_pattern: merchantPattern },
      UpdateExpression: "SET match_count = if_not_exists(match_count, :zero) + :one",
      ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
    }));
  } catch (err) {
    // Non-critical — if the count increment fails, categorization still works.
    // Log but don't throw to avoid breaking the main pipeline.
    console.warn("Failed to increment merchant match count:", err.message);
  }
}

/**
 * Get all merchant mappings.
 * Used by the admin interface to display and manage mappings.
 * The table can grow to thousands of entries, so we paginate.
 */
export async function getAllMerchantMappings() {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: config.dynamodb.merchantsTable };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * Delete a merchant mapping.
 * Used by admin to remove incorrect or outdated mappings.
 */
export async function deleteMerchantMapping(merchantPattern) {
  const result = await docClient.send(new DeleteCommand({
    TableName: config.dynamodb.merchantsTable,
    Key: { merchant_pattern: merchantPattern },
    ReturnValues: "ALL_OLD",
  }));
  return result.Attributes || null;
}
