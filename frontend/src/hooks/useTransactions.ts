/**
 * Transaction hooks — React Query wrappers for transaction operations.
 *
 * Provides:
 *   - useTransactions: Fetch transactions with filters
 *   - useUpdateCategory: Update a transaction's category (with auto-learn)
 *   - useAddTransaction: Create a manual transaction
 *   - useDeleteTransaction: Delete a transaction
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTransactions,
  updateTransactionCategory,
  addTransaction,
  deleteTransaction,
} from "@/api/transactions";

/** Fetch transactions with optional date range and category filters */
export function useTransactions(params?: {
  start_date?: string;
  end_date?: string;
  category?: string;
}) {
  return useQuery({
    queryKey: ["transactions", params],
    queryFn: () => fetchTransactions(params),
  });
}

/** Update a transaction's category — triggers auto-learning on backend */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      category,
    }: {
      transactionId: string;
      category: string;
    }) => updateTransactionCategory(transactionId, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** Create a manual transaction entry (cash expenses, etc.) */
export function useAddTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transaction: {
      date: string;
      description: string;
      amount: number;
      category: string;
    }) => addTransaction(transaction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** Delete a transaction */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) => deleteTransaction(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
