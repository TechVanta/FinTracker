// =============================================================================
// Transaction Routes — /api/transactions
// =============================================================================
// CRUD operations for financial transactions.
//
// GET    /api/transactions              — List transactions (with filters)
// POST   /api/transactions              — Manual transaction entry
// PATCH  /api/transactions/:id          — Update category (triggers auto-learning)
// DELETE /api/transactions/:id          — Delete a transaction
//
// Transactions are created two ways:
//   1. Automatically via the file processing pipeline (PDF/CSV/image upload)
//   2. Manually by the user (e.g., cash purchases that don't appear on statements)
//
// When a user corrects a transaction's category (PATCH), the auto-learning
// system records the correction in the merchant mapping table so future
// transactions from the same merchant are categorized correctly.
// =============================================================================

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import {
  getTransactionsByUser,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  createTransaction,
} from "../infrastructure/dynamodb.js";
import { learnMerchantCategory } from "../services/merchantService.js";

const router = Router();

/**
 * GET /api/transactions
 * List transactions for the authenticated user.
 *
 * Query params:
 *   start_date — Start of date range, YYYY-MM-DD (inclusive)
 *   end_date   — End of date range, YYYY-MM-DD (exclusive)
 *   category   — Filter by category name
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { start_date, end_date, category } = req.query;
    const transactions = await getTransactionsByUser(
      req.userId, start_date, end_date, category
    );
    return res.json(transactions);
  } catch (err) {
    console.error("List transactions error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * POST /api/transactions
 * Create a manual transaction entry.
 * For cash purchases, Interac transfers, or any expense not captured by uploads.
 *
 * Body: { date, description, amount, category }
 *   - date: YYYY-MM-DD format
 *   - description: Merchant or description text
 *   - amount: Transaction amount (positive number)
 *   - category: Category name (must match an active category)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { date, description, amount, category } = req.body;

    // Validate required fields
    if (!date || !description || amount === undefined || !category) {
      return res.status(400).json({
        detail: "date, description, amount, and category are required",
      });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        detail: "date must be in YYYY-MM-DD format",
      });
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        detail: "amount must be a positive number",
      });
    }

    const transaction = {
      transaction_id: uuidv4(),
      user_id: req.userId,
      date,
      description: description.trim(),
      amount: Math.round(parsedAmount * 100) / 100, // Round to 2 decimal places
      category,
      file_id: null, // Manual entries have no associated file
      source: "manual",
      created_at: new Date().toISOString(),
    };

    const created = await createTransaction(transaction);
    return res.status(201).json(created);
  } catch (err) {
    console.error("Create transaction error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * PATCH /api/transactions/:transactionId
 * Update a transaction's category.
 *
 * When the category changes, the auto-learning system records the correction
 * in the merchant mapping table. This means the next transaction from the
 * same merchant will be automatically categorized correctly.
 *
 * Body: { category }
 */
router.patch("/:transactionId", requireAuth, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ detail: "category is required" });
    }

    // Verify the transaction belongs to this user before updating
    const existing = await getTransactionById(req.params.transactionId);
    if (!existing) {
      return res.status(404).json({ detail: "Transaction not found" });
    }
    if (existing.user_id !== req.userId) {
      return res.status(403).json({ detail: "Not authorized to update this transaction" });
    }

    // Update the transaction
    const updated = await updateTransaction(req.params.transactionId, { category });

    // ── Auto-learning: Record this correction in the merchant mapping ──
    // When a user corrects a category, it means our categorization was wrong.
    // Save the correction so the same merchant is categorized correctly next time.
    // This runs fire-and-forget — we don't wait for it or fail if it errors.
    if (existing.description && category !== existing.category) {
      learnMerchantCategory(existing.description, category, "user_correction").catch((err) => {
        console.warn("Auto-learning failed:", err.message);
      });
    }

    return res.json(updated);
  } catch (err) {
    console.error("Update transaction error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * DELETE /api/transactions/:transactionId
 * Delete a transaction. Only the owner can delete their transactions.
 *
 * Used for removing duplicate or incorrect entries.
 */
router.delete("/:transactionId", requireAuth, async (req, res) => {
  try {
    // Verify the transaction belongs to this user before deleting
    const existing = await getTransactionById(req.params.transactionId);
    if (!existing) {
      return res.status(404).json({ detail: "Transaction not found" });
    }
    if (existing.user_id !== req.userId) {
      return res.status(403).json({ detail: "Not authorized to delete this transaction" });
    }

    await deleteTransaction(req.params.transactionId);
    return res.json({ message: "Transaction deleted", transaction_id: req.params.transactionId });
  } catch (err) {
    console.error("Delete transaction error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
