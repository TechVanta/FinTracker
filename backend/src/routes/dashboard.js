import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDashboardSummary } from "../services/dashboardService.js";

const router = Router();

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();
    const summary = await getDashboardSummary(req.userId, month, year);
    return res.json(summary);
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
