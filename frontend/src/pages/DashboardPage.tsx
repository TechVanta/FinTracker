import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary, fetchInsights } from "@/api/dashboard";
import type { Insight } from "@/api/dashboard";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import MonthlySummaryChart from "@/components/dashboard/MonthlySummaryChart";
import CategoryBreakdown from "@/components/dashboard/CategoryBreakdown";
import RecentTransactions from "@/components/dashboard/RecentTransactions";

/**
 * Compute the month-over-month percentage change.
 * Returns null when there is no previous month data to compare against.
 */
function computeMoMChange(
  current: number,
  previous: number
): { pct: number; direction: "up" | "down" | "flat" } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { pct: Math.abs(pct), direction };
}

/** Icon for the insight type — keeps the insight card visually distinct */
function insightIcon(type: string): string {
  switch (type) {
    case "spending_change":
      return "\u{1F4C8}"; // chart increasing
    case "top_category":
      return "\u{1F3AF}"; // target
    case "frequent_merchant":
      return "\u{1F6CD}\uFE0F"; // shopping bags
    case "daily_average":
      return "\u{1F4C5}"; // calendar
    case "category_count":
      return "\u{1F4CA}"; // bar chart
    default:
      return "\u{1F4A1}"; // light bulb
  }
}

/** Background colour per insight priority (1 = high, 3 = low) */
function insightBg(priority: number): string {
  if (priority <= 1) return "bg-red-50 border-red-200";
  if (priority === 2) return "bg-amber-50 border-amber-200";
  return "bg-blue-50 border-blue-200";
}

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Fetch the main dashboard summary (totals, breakdown, trends, merchants)
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard", month, year],
    queryFn: () => fetchDashboardSummary(month, year),
  });

  // Fetch rule-based insights separately so the main dashboard renders fast
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["insights", month, year],
    queryFn: () => fetchInsights(month, year),
  });

  const mom = summary
    ? computeMoMChange(summary.total_spending, summary.previous_month_total)
    : null;

  const categoryCount = Object.keys(summary?.category_breakdown ?? {}).length;

  return (
    <div className="space-y-6">
      {/* Header with month/year selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <select
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2024, i).toLocaleString("default", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
          <select
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => {
              const y = now.getFullYear() - i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {summaryLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* ── Summary Cards ────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Spending with month-over-month comparison */}
            <Card>
              <p className="text-sm text-gray-500">Total Spending</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                ${summary?.total_spending.toFixed(2) ?? "0.00"}
              </p>
              {mom && (
                <p
                  className={`text-sm mt-1 flex items-center gap-1 ${
                    mom.direction === "up" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {mom.direction === "up" ? (
                    <span aria-label="increased">&uarr;</span>
                  ) : (
                    <span aria-label="decreased">&darr;</span>
                  )}
                  {mom.pct.toFixed(1)}% vs last month
                </p>
              )}
            </Card>

            {/* Transaction count */}
            <Card>
              <p className="text-sm text-gray-500">Transactions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {summary?.transaction_count ?? 0}
              </p>
            </Card>

            {/* Categories count */}
            <Card>
              <p className="text-sm text-gray-500">Categories</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {categoryCount}
              </p>
            </Card>
          </div>

          {/* ── Charts ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MonthlySummaryChart data={summary?.monthly_trend ?? []} />
            <CategoryBreakdown data={summary?.category_breakdown ?? {}} />
          </div>

          {/* ── Top Merchants ────────────────────────────────── */}
          {summary?.top_merchants && summary.top_merchants.length > 0 && (
            <Card title="Top Merchants">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-2 font-medium">Merchant</th>
                      <th className="pb-2 font-medium text-right">
                        Transactions
                      </th>
                      <th className="pb-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.top_merchants.map((m) => (
                      <tr
                        key={m.name}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="py-2 font-medium text-gray-900">
                          {m.name}
                        </td>
                        <td className="py-2 text-right text-gray-600">
                          {m.count}
                        </td>
                        <td className="py-2 text-right font-mono text-gray-900">
                          ${m.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Insights ─────────────────────────────────────── */}
          <InsightsSection insights={insights} isLoading={insightsLoading} />

          {/* ── Recent Transactions ──────────────────────────── */}
          <RecentTransactions />
        </>
      )}
    </div>
  );
}

/**
 * Renders rule-based spending insights returned by the backend.
 * Each insight is displayed as a compact card with an icon, priority colour,
 * and the human-readable message from the API.
 */
function InsightsSection({
  insights,
  isLoading,
}: {
  insights: Insight[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card title="Insights">
        <div className="flex justify-center py-6">
          <Spinner className="h-6 w-6" />
        </div>
      </Card>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <Card title="Insights">
        <p className="text-sm text-gray-500 text-center py-6">
          No insights available for this period
        </p>
      </Card>
    );
  }

  return (
    <Card title="Insights">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-4 ${insightBg(insight.priority)}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none">
                {insightIcon(insight.type)}
              </span>
              <p className="text-sm text-gray-800">{insight.message}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
