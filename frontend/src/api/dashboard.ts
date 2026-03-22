import apiClient from "./client";

export interface DashboardSummary {
  total_spending: number;
  category_breakdown: Record<string, number>;
  monthly_trend: Array<{ date: string; amount: number }>;
  transaction_count: number;
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
