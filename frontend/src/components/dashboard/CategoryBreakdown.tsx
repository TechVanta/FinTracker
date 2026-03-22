import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import Card from "@/components/ui/Card";

/**
 * Extended palette so dynamically-generated categories always get a distinct
 * colour even when there are more than seven.
 */
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
  "#14b8a6", // teal
  "#f97316", // orange
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
];

interface CategoryBreakdownProps {
  data: Record<string, number>;
}

export default function CategoryBreakdown({ data }: CategoryBreakdownProps) {
  // Sort categories by value descending so the largest slice renders first
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <Card title="Category Breakdown">
        <p className="text-sm text-gray-500 text-center py-8">
          No category data available
        </p>
      </Card>
    );
  }

  return (
    <Card title="Category Breakdown">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              paddingAngle={2}
            >
              {chartData.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Spent"]}
            />
            <Legend
              formatter={(value: string) =>
                // Truncate very long category names in the legend
                value.length > 18 ? `${value.slice(0, 16)}...` : value
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
