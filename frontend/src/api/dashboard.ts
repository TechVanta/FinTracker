/**
 * Dashboard API — Fetches spending analytics and insights.
 *
 * Two endpoints:
 *   - summary: Aggregated monthly spending data (totals, breakdown, trends)
 *   - insights: Rule-based observations about spending patterns
 */

import apiClient from "./client";

/** Monthly spending summary returned by the dashboard endpoint */
export interface DashboardSummary {
  total_spending: number;
  previous_month_total: number;
  category_breakdown: Record<string, number>;
  monthly_trend: Array<{ date: string; amount: number }>;
  top_merchants: Array<{ name: string; count: number; total: number }>;
  transaction_count: number;
}

/** A single spending insight (rule-based, not AI) */
export interface Insight {
  type: string;
  message: string;
  priority: number;
  amount?: number;
  previous?: number;
  change_pct?: number;
  category?: string;
  percentage?: number;
  merchant?: string;
  visit_count?: number;
  total?: number;
  daily_average?: number;
  categories?: string[];
}

export async function fetchDashboardSummary(
  month: number,
  year: number
): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>(
    "/dashboard/summary",
    { params: { month, year } }
  );
  return data;
}

export async function fetchInsights(
  month: number,
  year: number
): Promise<Insight[]> {
  const { data } = await apiClient.get<Insight[]>("/dashboard/insights", {
    params: { month, year },
  });
  return data;
}
