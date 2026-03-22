import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getTransactionsByUser, updateTransaction } from "../infrastructure/dynamodb.js";

const router = Router();

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

router.patch("/:transactionId", requireAuth, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ detail: "category is required" });
    }
    const updated = await updateTransaction(req.params.transactionId, { category });
    return res.json(updated);
  } catch (err) {
    console.error("Update transaction error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
