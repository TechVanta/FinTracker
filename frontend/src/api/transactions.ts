import apiClient from "./client";

export interface Transaction {
  transaction_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  file_id: string;
}

interface TransactionParams {
  start_date?: string;
  end_date?: string;
  category?: string;
}

export async function fetchTransactions(
  params?: TransactionParams
): Promise<Transaction[]> {
  const { data } = await apiClient.get<Transaction[]>("/transactions", {
    params,
  });
  return data;
}

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
