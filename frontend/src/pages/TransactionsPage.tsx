import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories, type Category } from "@/api/categories";
import { useAddTransaction } from "@/hooks/useTransactions";
import TransactionTable from "@/components/transactions/TransactionTable";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/**
 * TransactionsPage — Browse, filter, and manually add transactions.
 *
 * Categories are fetched dynamically from the API instead of being hardcoded.
 * The "Add Transaction" modal lets users record cash expenses or other manual entries.
 */
export default function TransactionsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [category, setCategory] = useState("All");
  const [showAddForm, setShowAddForm] = useState(false);

  // Dynamic categories from the API
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  // Manual transaction form state
  const [formDate, setFormDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const addTransaction = useAddTransaction();

  // Date range for the selected month/year
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  /** Submit a new manual transaction */
  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim() || !formAmount || !formCategory) return;

    addTransaction.mutate(
      {
        date: formDate,
        description: formDescription.trim(),
        amount: parseFloat(formAmount),
        category: formCategory,
      },
      {
        onSuccess: () => {
          // Reset form and close modal
          setFormDescription("");
          setFormAmount("");
          setFormCategory("");
          setFormDate(new Date().toISOString().slice(0, 10));
          setShowAddForm(false);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header row: title + filters + add button */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="flex items-center gap-2">
          {/* Category filter — "All" + dynamic categories */}
          <select
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="All">All</option>
            {categories.map((cat) => (
              <option key={cat.category_id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Month selector */}
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

          {/* Year selector */}
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

          {/* Add Transaction button */}
          <Button onClick={() => setShowAddForm(true)}>
            <svg
              className="h-4 w-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Add Transaction modal overlay */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowAddForm(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Card title="Add Transaction" className="w-full max-w-md">
              <form onSubmit={handleAddTransaction} className="space-y-4">
                <Input
                  label="Date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
                <Input
                  label="Description"
                  type="text"
                  placeholder="e.g. Coffee at Blue Bottle"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                />
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.category_id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={addTransaction.isPending}
                    disabled={
                      !formDescription.trim() || !formAmount || !formCategory
                    }
                  >
                    Save
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}

      {/* Transaction table */}
      <TransactionTable
        startDate={startDate}
        endDate={endDate}
        categoryFilter={category === "All" ? undefined : category}
      />
    </div>
  );
}
