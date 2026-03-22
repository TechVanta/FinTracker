import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listFiles, deleteFile } from "@/api/files";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function FileList() {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: listFiles,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500 text-center py-4">
          No files uploaded yet. Upload your first statement above.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Uploaded Files">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">Filename</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Transactions</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {files.map((file) => (
              <tr key={file.file_id}>
                <td className="py-3 font-medium text-gray-900">
                  {file.original_filename}
                </td>
                <td className="py-3 text-gray-600 uppercase">
                  {file.file_type}
                </td>
                <td className="py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[file.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {file.status}
                  </span>
                </td>
                <td className="py-3 text-gray-600">{file.transaction_count}</td>
                <td className="py-3 text-gray-600">
                  {new Date(file.upload_date).toLocaleDateString()}
                </td>
                <td className="py-3 text-right">
                  {confirmId === file.file_id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">
                        Delete {file.transaction_count} transactions?
                      </span>
                      <button
                        onClick={() => deleteMutation.mutate(file.file_id)}
                        disabled={deleteMutation.isPending}
                        className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={deleteMutation.isPending}
                        className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(file.file_id)}
                      className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deleteMutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          Failed to delete file. Please try again.
        </p>
      )}
    </Card>
  );
}
