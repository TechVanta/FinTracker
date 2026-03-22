import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchTransactions,
  updateTransactionCategory,
} from "@/api/transactions";

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
