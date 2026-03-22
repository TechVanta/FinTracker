import { useState } from "react";
import { useTransactions, useUpdateCategory } from "@/hooks/useTransactions";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

const CATEGORIES = [
  "Food",
  "Travel",
  "Groceries",
  "Bills",
  "Shopping",
  "Entertainment",
  "Other",
];

interface TransactionTableProps {
  startDate?: string;
  endDate?: string;
  categoryFilter?: string;
}

export default function TransactionTable({
  startDate,
  endDate,
  categoryFilter,
}: TransactionTableProps) {
  const { data: transactions, isLoading } = useTransactions({
    start_date: startDate,
    end_date: endDate,
    category: categoryFilter,
  });
  const updateCategory = useUpdateCategory();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500 text-center py-4">
          No transactions found. Upload a statement to get started.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Amount</th>
              <th className="pb-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((txn) => (
              <tr key={txn.transaction_id} className="hover:bg-gray-50">
                <td className="py-3 text-gray-600">{txn.date}</td>
                <td className="py-3 font-medium text-gray-900">
                  {txn.description}
                </td>
                <td className="py-3 text-right font-mono text-gray-900">
                  ${txn.amount.toFixed(2)}
                </td>
                <td className="py-3">
                  {editingId === txn.transaction_id ? (
                    <select
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      defaultValue={txn.category}
                      onChange={(e) => {
                        updateCategory.mutate({
                          transactionId: txn.transaction_id,
                          category: e.target.value,
                        });
                        setEditingId(null);
                      }}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                      onClick={() => setEditingId(txn.transaction_id)}
                    >
                      {txn.category}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
