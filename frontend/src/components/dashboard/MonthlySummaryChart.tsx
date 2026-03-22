import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/components/ui/Card";

interface MonthlySummaryChartProps {
  data: Array<{ date: string; amount: number }>;
}

export default function MonthlySummaryChart({
  data,
}: MonthlySummaryChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card title="Daily Spending">
        <p className="text-sm text-gray-500 text-center py-8">
          No spending data for this period
        </p>
      </Card>
    );
  }

  return (
    <Card title="Daily Spending">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(8)}
            />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Spent"]}
              labelFormatter={(label: string) => `Date: ${label}`}
            />
            <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
