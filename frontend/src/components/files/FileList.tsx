import { useQuery } from "@tanstack/react-query";
import { listFiles } from "@/api/files";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function FileList() {
  const { data: files, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: listFiles,
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
