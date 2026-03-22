// =============================================================================
// Dashboard & Insights Service
// =============================================================================
// Generates spending analytics and rule-based insights for the dashboard.
//
// Two main functions:
//   1. getDashboardSummary — Aggregated spending data for a given month
//      (total spending, category breakdown, daily trend, top merchants)
//   2. getInsights — Rule-based spending insights comparing current month
//      to previous month (no LLM needed — pure JavaScript math)
//
// All computation happens in-memory after fetching transactions from DynamoDB.
// At <100 users this is fast enough (<50ms). When we migrate to PostgreSQL
// in Phase 2-3, these aggregations become SQL GROUP BY queries.
//
// Business context:
//   These two endpoints power the main dashboard — the screen users see
//   when they open the app. The quality of insights directly impacts
//   whether users find the app valuable and keep coming back.
// =============================================================================

import { getTransactionsByUser } from "../infrastructure/dynamodb.js";

// =============================================================================
// DASHBOARD SUMMARY
// =============================================================================

/**
 * Generate the main dashboard summary for a given month.
 *
 * Returns:
 *   - total_spending: Sum of all transaction amounts
 *   - transaction_count: Number of transactions
 *   - category_breakdown: { categoryName: totalAmount, ... }
 *   - daily_trend: [{ date, amount }, ...] sorted chronologically
 *   - top_merchants: [{ name, count, total }, ...] top 10 by total spend
 *   - previous_month_total: Last month's total (for comparison)
 *
 * @param {string} userId - The user's ID
 * @param {number} month - Month number (1-12)
 * @param {number} year - Full year (e.g., 2026)
 */
export async function getDashboardSummary(userId, month, year) {
  // Calculate date range for the requested month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  // Fetch current month's transactions
  const transactions = await getTransactionsByUser(userId, startDate, endDate);

  // Fetch previous month's transactions for comparison
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevTransactions = await getTransactionsByUser(userId, prevStartDate, startDate);

  // ── Aggregate current month ──────────────────────────────────────────
  let totalSpending = 0;
  const categoryTotals = {};
  const dailyTotals = {};
  const merchantAgg = {}; // { merchantName: { count, total } }

  for (const txn of transactions) {
    // Skip income and transfers for spending calculations
    if (txn.category === "Income" || txn.category === "Transfers") continue;

    totalSpending += txn.amount;

    // Category breakdown
    categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + txn.amount;

    // Daily trend
    dailyTotals[txn.date] = (dailyTotals[txn.date] || 0) + txn.amount;

    // Merchant aggregation (normalize description for grouping)
    const merchant = txn.description.substring(0, 30).trim(); // Truncate for grouping
    if (!merchantAgg[merchant]) {
      merchantAgg[merchant] = { name: merchant, count: 0, total: 0 };
    }
    merchantAgg[merchant].count++;
    merchantAgg[merchant].total += txn.amount;
  }

  // ── Build daily trend (sorted by date) ───────────────────────────────
  const monthlyTrend = Object.entries(dailyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({
      date,
      amount: roundMoney(amount),
    }));

  // ── Build top merchants (top 10 by total spend) ─────────────────────
  const topMerchants = Object.values(merchantAgg)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((m) => ({
      name: m.name,
      count: m.count,
      total: roundMoney(m.total),
    }));

  // ── Calculate previous month total ───────────────────────────────────
  let previousMonthTotal = 0;
  for (const txn of prevTransactions) {
    if (txn.category === "Income" || txn.category === "Transfers") continue;
    previousMonthTotal += txn.amount;
  }

  // ── Build sorted category breakdown ──────────────────────────────────
  const categoryBreakdown = Object.fromEntries(
    Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a) // Sort by amount descending
      .map(([k, v]) => [k, roundMoney(v)])
  );

  return {
    total_spending: roundMoney(totalSpending),
    previous_month_total: roundMoney(previousMonthTotal),
    category_breakdown: categoryBreakdown,
    monthly_trend: monthlyTrend,
    top_merchants: topMerchants,
    transaction_count: transactions.length,
  };
}

// =============================================================================
// INSIGHTS ENGINE (Rule-Based, No LLM)
// =============================================================================

/**
 * Generate rule-based spending insights for the current month.
 *
 * Each insight is a plain-English observation about the user's spending:
 *   - Month-over-month total change
 *   - Top spending category
 *   - Category spikes (>25% increase from last month)
 *   - Most frequent merchant
 *   - Daily average spending
 *   - Category count
 *
 * These are computed from transaction data using simple math —
 * no LLM calls, no ML models, just JavaScript arithmetic.
 * This covers ~80% of the value that "AI insights" would provide.
 *
 * @param {string} userId - The user's ID
 * @param {number} month - Month number (1-12)
 * @param {number} year - Full year (e.g., 2026)
 * @returns {Array<{type: string, message: string, ...}>}
 */
export async function getInsights(userId, month, year) {
  // Fetch current and previous month transactions
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;

  const [transactions, prevTransactions] = await Promise.all([
    getTransactionsByUser(userId, startDate, endDate),
    getTransactionsByUser(userId, prevStartDate, startDate),
  ]);

  // Filter out income and transfers for spending analysis
  const spending = transactions.filter((t) => t.category !== "Income" && t.category !== "Transfers");
  const prevSpending = prevTransactions.filter((t) => t.category !== "Income" && t.category !== "Transfers");

  const insights = [];

  // If no transactions exist, return a single helpful insight
  if (spending.length === 0) {
    insights.push({
      type: "empty",
      message: "No spending data for this month yet. Upload a statement or add a transaction to get started.",
      priority: 1,
    });
    return insights;
  }

  // ── Calculate aggregations ───────────────────────────────────────────
  const thisTotal = spending.reduce((sum, t) => sum + t.amount, 0);
  const prevTotal = prevSpending.reduce((sum, t) => sum + t.amount, 0);

  // Current month category totals
  const categoryTotals = {};
  for (const t of spending) {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  }

  // Previous month category totals
  const prevCategoryTotals = {};
  for (const t of prevSpending) {
    prevCategoryTotals[t.category] = (prevCategoryTotals[t.category] || 0) + t.amount;
  }

  // Merchant frequency
  const merchantCounts = {};
  for (const t of spending) {
    const key = t.description.substring(0, 30).trim();
    if (!merchantCounts[key]) merchantCounts[key] = { count: 0, total: 0 };
    merchantCounts[key].count++;
    merchantCounts[key].total += t.amount;
  }

  // ── INSIGHT: Month-over-month total spending change ──────────────────
  if (prevTotal > 0) {
    const pctChange = ((thisTotal - prevTotal) / prevTotal) * 100;
    if (Math.abs(pctChange) >= 5) {
      const direction = pctChange > 0 ? "more" : "less";
      insights.push({
        type: pctChange > 0 ? "overspending" : "saving",
        message: `You spent ${Math.abs(pctChange).toFixed(0)}% ${direction} this month compared to last month ($${roundMoney(thisTotal)} vs $${roundMoney(prevTotal)}).`,
        amount: roundMoney(thisTotal),
        previous: roundMoney(prevTotal),
        change_pct: roundMoney(pctChange),
        priority: 1,
      });
    }
  }

  // ── INSIGHT: Top spending category ───────────────────────────────────
  const sortedCategories = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);
  if (sortedCategories.length > 0) {
    const [topCat, topAmount] = sortedCategories[0];
    const pctOfTotal = (topAmount / thisTotal) * 100;
    insights.push({
      type: "top_category",
      message: `${topCat} is your biggest spending category at $${roundMoney(topAmount)} (${pctOfTotal.toFixed(0)}% of total).`,
      category: topCat,
      amount: roundMoney(topAmount),
      percentage: roundMoney(pctOfTotal),
      priority: 2,
    });
  }

  // ── INSIGHT: Category spikes (any category up >25% from last month) ──
  for (const [category, amount] of Object.entries(categoryTotals)) {
    const prev = prevCategoryTotals[category] || 0;
    if (prev > 0 && amount > prev * 1.25) {
      const pctIncrease = ((amount - prev) / prev) * 100;
      insights.push({
        type: "category_spike",
        message: `${category} spending is up ${pctIncrease.toFixed(0)}% from last month ($${roundMoney(amount)} vs $${roundMoney(prev)}).`,
        category,
        amount: roundMoney(amount),
        previous: roundMoney(prev),
        change_pct: roundMoney(pctIncrease),
        priority: 3,
      });
    }
  }

  // ── INSIGHT: Most frequent merchant ──────────────────────────────────
  const topMerchant = Object.entries(merchantCounts)
    .sort(([, a], [, b]) => b.count - a.count)[0];

  if (topMerchant && topMerchant[1].count >= 3) {
    const [name, { count, total }] = topMerchant;
    insights.push({
      type: "frequent_merchant",
      message: `You visited ${name} ${count} times this month, spending $${roundMoney(total)} total.`,
      merchant: name,
      visit_count: count,
      total: roundMoney(total),
      priority: 4,
    });
  }

  // ── INSIGHT: Daily average spending ──────────────────────────────────
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const daysInMonth = isCurrentMonth ? today.getDate() : new Date(year, month, 0).getDate();

  if (daysInMonth > 0) {
    const dailyAvg = thisTotal / daysInMonth;
    insights.push({
      type: "daily_average",
      message: `You're averaging $${roundMoney(dailyAvg)} per day in spending this month.`,
      daily_average: roundMoney(dailyAvg),
      priority: 5,
    });
  }

  // ── INSIGHT: New categories this month ───────────────────────────────
  const newCategories = Object.keys(categoryTotals).filter(
    (cat) => !prevCategoryTotals[cat]
  );
  if (newCategories.length > 0 && prevTotal > 0) {
    insights.push({
      type: "new_categories",
      message: `New spending categories this month: ${newCategories.join(", ")}.`,
      categories: newCategories,
      priority: 6,
    });
  }

  // Sort insights by priority (most important first)
  return insights.sort((a, b) => a.priority - b.priority);
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Round a number to 2 decimal places for money display.
 * Avoids floating point artifacts like $12.340000000001.
 */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}
