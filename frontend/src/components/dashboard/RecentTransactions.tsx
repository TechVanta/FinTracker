import { useTransactions } from "@/hooks/useTransactions";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

export default function RecentTransactions() {
  const { data: transactions, isLoading } = useTransactions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const recent = Array.isArray(transactions) ? transactions.slice(0, 10) : [];

  if (recent.length === 0) {
    return (
      <Card title="Recent Transactions">
        <p className="text-sm text-gray-500 text-center py-4">
          No transactions yet
        </p>
      </Card>
    );
  }

  return (
    <Card title="Recent Transactions">
      <div className="space-y-3">
        {recent.map((txn) => (
          <div
            key={txn.transaction_id}
            className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                {txn.description}
              </p>
              <p className="text-xs text-gray-500">
                {txn.date} &middot; {txn.category}
              </p>
            </div>
            <span className="text-sm font-mono font-medium text-gray-900">
              ${txn.amount.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
