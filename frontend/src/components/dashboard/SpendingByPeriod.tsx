/**
 * SpendingByPeriod — Bar chart showing spending grouped by day/week/month/year.
 *
 * Users toggle between time periods to see different views of their spending:
 *   - Day: Each bar is one day within the selected month
 *   - Week: Each bar is one week within the selected month
 *   - Month: Each bar is one month within the selected year
 *   - Year: Each bar is one year (historical comparison)
 *
 * Each bar shows total spending with a category breakdown on hover (tooltip).
 * The category totals table below the chart shows the breakdown for the
 * entire selected period.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  fetchSpendingByPeriod,
  type SpendingPeriod,
  type SpendingByPeriod as SpendingData,
} from "@/api/dashboard";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

interface SpendingByPeriodProps {
  month: number;
  year: number;
}

const PERIOD_OPTIONS: { value: SpendingPeriod; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

/** Color palette for category bars in the breakdown table */
const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#a855f7", "#06b6d4",
  "#84cc16", "#6b7280",
];

export default function SpendingByPeriod({ month, year }: SpendingByPeriodProps) {
  const [period, setPeriod] = useState<SpendingPeriod>("day");

  const { data, isLoading } = useQuery({
    queryKey: ["spending", period, month, year],
    queryFn: () => fetchSpendingByPeriod(period, month, year),
  });

  return (
    <Card>
      {/* Period toggle buttons */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Spending Breakdown</h3>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === opt.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !data || !Array.isArray(data.buckets) || data.buckets.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">
          No spending data for this period
        </p>
      ) : (
        <>
          {/* Bar chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={period === "day" ? 2 : 0}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const bucket = payload[0].payload as SpendingData["buckets"][0];
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                        <p className="font-semibold text-gray-900 mb-1">
                          {bucket.label} — ${bucket.total.toFixed(2)}
                        </p>
                        {Object.entries(bucket.categories)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 5)
                          .map(([cat, amt]) => (
                            <p key={cat} className="text-gray-600">
                              {cat}: ${amt.toFixed(2)}
                            </p>
                          ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Category breakdown table */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Category Totals — {PERIOD_OPTIONS.find((p) => p.value === period)?.label}
            </h4>
            <div className="space-y-2">
              {Object.entries(data.category_totals ?? {})
                .slice(0, 8) // Show top 8 categories
                .map(([category, amount], idx) => {
                  const pct = data.total > 0 ? (amount / data.total) * 100 : 0;
                  return (
                    <div key={category} className="flex items-center gap-2">
                      {/* Color indicator */}
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      {/* Category name */}
                      <span className="text-xs text-gray-700 flex-1 truncate">
                        {category}
                      </span>
                      {/* Progress bar */}
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                          }}
                        />
                      </div>
                      {/* Amount */}
                      <span className="text-xs font-mono text-gray-900 w-20 text-right">
                        ${amount.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
            </div>
            {/* Total */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-700">Total</span>
              <span className="text-sm font-semibold font-mono text-gray-900">
                ${data.total.toFixed(2)}
              </span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
