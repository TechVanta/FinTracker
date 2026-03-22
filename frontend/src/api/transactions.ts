/**
 * Transactions API — CRUD operations for financial transactions.
 *
 * Transactions are created two ways:
 *   1. Automatically from uploaded documents (PDF/CSV/images)
 *   2. Manually via the addTransaction function (cash expenses, etc.)
 */

import apiClient from "./client";

/** A single financial transaction */
export interface Transaction {
  transaction_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  file_id: string | null;
  source?: string; // "csv" | "pdf" | "image" | "manual"
}

interface TransactionParams {
  start_date?: string;
  end_date?: string;
  category?: string;
}

/** Fetch transactions with optional date range and category filters */
export async function fetchTransactions(
  params?: TransactionParams
): Promise<Transaction[]> {
  const { data } = await apiClient.get<Transaction[]>("/transactions", {
    params,
  });
  return data;
}

/** Update a transaction's category (triggers auto-learning on backend) */
export async function updateTransactionCategory(
  transactionId: string,
  category: string
): Promise<Transaction> {
  const { data } = await apiClient.patch<Transaction>(
    `/transactions/${transactionId}`,
    { category }
  );
  return data;
}

/** Create a manual transaction entry (for cash expenses, etc.) */
export async function addTransaction(transaction: {
  date: string;
  description: string;
  amount: number;
  category: string;
}): Promise<Transaction> {
  const { data } = await apiClient.post<Transaction>(
    "/transactions",
    transaction
  );
  return data;
}

/** Delete a transaction by ID */
export async function deleteTransaction(
  transactionId: string
): Promise<void> {
  await apiClient.delete(`/transactions/${transactionId}`);
}
