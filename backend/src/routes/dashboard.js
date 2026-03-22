// =============================================================================
// Dashboard Routes — /api/dashboard
// =============================================================================
// Analytics endpoints that power the main dashboard screen.
//
// GET /api/dashboard/summary    — Monthly spending summary (totals, breakdown, trends)
// GET /api/dashboard/insights   — Rule-based spending insights (comparisons, alerts)
//
// These are the most-visited endpoints in the app — they load every time
// the user opens the dashboard. Optimized for fast response by doing all
// aggregation in-memory after a single DynamoDB query per month.
// =============================================================================

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDashboardSummary, getInsights } from "../services/dashboardService.js";

const router = Router();

/**
 * GET /api/dashboard/summary
 * Returns aggregated spending data for a specific month.
 *
 * Query params:
 *   month — Month number (1-12), defaults to current month
 *   year  — Full year (e.g., 2026), defaults to current year
 *
 * Response includes:
 *   - total_spending and previous_month_total (for month-over-month)
 *   - category_breakdown (sorted by amount)
 *   - monthly_trend (daily spending for chart)
 *   - top_merchants (top 10 by spend)
 *   - transaction_count
 */
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();
    const summary = await getDashboardSummary(req.userId, month, year);
    return res.json(summary);
  } catch (err) {
    console.error("Dashboard summary error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

/**
 * GET /api/dashboard/insights
 * Returns rule-based spending insights for a specific month.
 *
 * Query params:
 *   month — Month number (1-12), defaults to current month
 *   year  — Full year (e.g., 2026), defaults to current year
 *
 * Insights include:
 *   - Month-over-month spending change
 *   - Top category
 *   - Category spikes
 *   - Most frequent merchant
 *   - Daily average spending
 *
 * All insights are generated using rules and math — no LLM calls.
 */
router.get("/insights", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year = parseInt(req.query.year) || now.getFullYear();
    const insights = await getInsights(req.userId, month, year);
    return res.json(insights);
  } catch (err) {
    console.error("Dashboard insights error:", err);
    return res.status(err.status || 500).json({ detail: err.message });
  }
});

export default router;
