/**
 * FileUpload — Drag-and-drop upload zone for bank/credit card statements.
 *
 * Supports PDF and CSV files. Handles the full upload pipeline:
 *   1. User selects or drops a file
 *   2. File is uploaded directly to S3 via presigned URL
 *   3. Backend processes the file (extraction + categorization)
 *   4. Dashboard and transaction list refresh automatically
 */

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { requestUploadUrl, uploadFileToS3, processFile } from "@/api/files";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

type UploadStage = "idle" | "uploading" | "processing" | "done" | "error";

export default function FileUpload() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  // Ref for the hidden file input — triggered programmatically by the Browse button
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setStage("uploading");
      setError("");

      // Step 1: Get a presigned S3 URL from the backend
      const { file_id, upload_url } = await requestUploadUrl(
        file.name,
        file.type || "application/octet-stream"
      );

      // Step 2: Upload directly to S3 (bypasses Lambda 6MB limit)
      await uploadFileToS3(upload_url, file);

      // Step 3: Trigger backend processing (extract + categorize transactions)
      setStage("processing");
      const result = await processFile(file_id);
      return result;
    },
    onSuccess: () => {
      setStage("done");
      // Refresh all data so the dashboard, transactions, and file list update
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setTimeout(() => setStage("idle"), 3000);
    },
    onError: (err: Error) => {
      setStage("error");
      if (err instanceof AxiosError && err.response?.data?.detail) {
        setError(String(err.response.data.detail));
      } else {
        setError(err.message || "Upload failed");
      }
    },
  });

  /** Validate the file type and kick off the upload pipeline */
  const handleFile = useCallback(
    (file: File) => {
      // Check by extension (more reliable than MIME type for CSV files)
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "pdf" && ext !== "csv") {
        setError("Please upload a PDF or CSV file (credit card or bank statement)");
        setStage("error");
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  /** Handle file drop */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  /** Handle file input change (from Browse button) */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be selected again
    e.target.value = "";
  };

  return (
    <Card title="Upload Statement">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? "border-primary-500 bg-primary-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {stage === "idle" && (
          <>
            {/* Upload icon */}
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Drag and drop your credit card or bank statement here, or
            </p>

            {/* Hidden file input — triggered by the Browse button */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.csv"
              onChange={handleInputChange}
            />

            {/* Browse button — clicks the hidden input programmatically */}
            <Button
              variant="secondary"
              type="button"
              className="mt-2"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </Button>

            <p className="mt-2 text-xs text-gray-500">
              PDF or CSV files — credit card statements, bank exports
            </p>
          </>
        )}

        {stage === "uploading" && (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-600">Uploading file...</p>
          </div>
        )}

        {stage === "processing" && (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-600">
              Extracting and categorizing transactions...
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="h-8 w-8 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p className="text-sm text-green-600">
              File processed successfully!
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-2">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setStage("idle");
                setError("");
              }}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
