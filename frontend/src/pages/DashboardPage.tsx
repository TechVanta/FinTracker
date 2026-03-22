import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary } from "@/api/dashboard";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import MonthlySummaryChart from "@/components/dashboard/MonthlySummaryChart";
import CategoryBreakdown from "@/components/dashboard/CategoryBreakdown";
import RecentTransactions from "@/components/dashboard/RecentTransactions";

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard", month, year],
    queryFn: () => fetchDashboardSummary(month, year),
  });

  return (
    <div className="space-y-6">
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-gray-500">Total Spending</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                ${summary?.total_spending.toFixed(2) ?? "0.00"}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Transactions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {summary?.transaction_count ?? 0}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Categories</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {Object.keys(summary?.category_breakdown ?? {}).length}
              </p>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MonthlySummaryChart data={summary?.monthly_trend ?? []} />
            <CategoryBreakdown data={summary?.category_breakdown ?? {}} />
          </div>

          {/* Recent transactions */}
          <RecentTransactions />
        </>
      )}
    </div>
  );
}
