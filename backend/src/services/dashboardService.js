import { getTransactionsByUser } from "../infrastructure/dynamodb.js";

export async function getDashboardSummary(userId, month, year) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const transactions = await getTransactionsByUser(userId, startDate, endDate);

  let totalSpending = 0;
  const categoryTotals = {};
  const dailyTotals = {};

  for (const txn of transactions) {
    totalSpending += txn.amount;
    categoryTotals[txn.category] = (categoryTotals[txn.category] || 0) + txn.amount;
    dailyTotals[txn.date] = (dailyTotals[txn.date] || 0) + txn.amount;
  }

  const monthlyTrend = Object.entries(dailyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  return {
    total_spending: Math.round(totalSpending * 100) / 100,
    category_breakdown: Object.fromEntries(
      Object.entries(categoryTotals).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    monthly_trend: monthlyTrend,
    transaction_count: transactions.length,
  };
}
