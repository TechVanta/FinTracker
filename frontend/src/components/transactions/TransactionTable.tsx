import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useTransactions,
  useUpdateCategory,
  useDeleteTransaction,
} from "@/hooks/useTransactions";
import { fetchCategories, type Category } from "@/api/categories";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

/** Badge colors for transaction source types */
const SOURCE_STYLES: Record<string, string> = {
  csv: "bg-blue-100 text-blue-700",
  pdf: "bg-orange-100 text-orange-700",
  image: "bg-purple-100 text-purple-700",
  manual: "bg-green-100 text-green-700",
};

interface TransactionTableProps {
  startDate?: string;
  endDate?: string;
  categoryFilter?: string;
}

/**
 * TransactionTable — Renders a paginated table of transactions.
 *
 * Features:
 *   - Inline category editing via dropdown (dynamic categories from API)
 *   - Source badge (manual, csv, pdf, image)
 *   - Row-level delete on hover
 */
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

  // Dynamic categories for the inline edit dropdown
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const updateCategory = useUpdateCategory();
  const deleteTxn = useDeleteTransaction();
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
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium w-10">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((txn) => {
              const source = txn.source || "csv";
              const sourceStyle =
                SOURCE_STYLES[source] || "bg-gray-100 text-gray-700";

              return (
                <tr
                  key={txn.transaction_id}
                  className="group hover:bg-gray-50"
                >
                  {/* Date */}
                  <td className="py-3 text-gray-600">{txn.date}</td>

                  {/* Description */}
                  <td className="py-3 font-medium text-gray-900">
                    {txn.description}
                  </td>

                  {/* Amount */}
                  <td className="py-3 text-right font-mono text-gray-900">
                    ${txn.amount.toFixed(2)}
                  </td>

                  {/* Category — inline editable */}
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
                        {categories.map((cat) => (
                          <option key={cat.category_id} value={cat.name}>
                            {cat.name}
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

                  {/* Source badge */}
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sourceStyle}`}
                    >
                      {source}
                    </span>
                  </td>

                  {/* Delete action — visible on row hover */}
                  <td className="py-3 text-right">
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                      title="Delete transaction"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete this transaction? This cannot be undone."
                          )
                        ) {
                          deleteTxn.mutate(txn.transaction_id);
                        }
                      }}
                    >
                      {/* Trash icon */}
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
