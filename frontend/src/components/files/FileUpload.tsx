import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { requestUploadUrl, uploadFileToS3, processFile } from "@/api/files";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

type UploadStage = "idle" | "uploading" | "processing" | "done" | "error";

/** MIME types accepted for upload (PDF, CSV, and common image formats) */
const VALID_TYPES = [
  "application/pdf",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
];

/** File extensions shown in the file picker */
const ACCEPT_STRING = ".pdf,.csv,.jpg,.jpeg,.png,.heic,.webp";

/**
 * FileUpload — Drag-and-drop upload zone for statements, receipts, and screenshots.
 *
 * Supports PDF, CSV, and image files (JPG, PNG, HEIC, WebP).
 * Includes a dedicated camera button for mobile devices to capture receipts.
 */
export default function FileUpload() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  // Ref for the hidden camera input (mobile capture)
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setStage("uploading");
      setError("");

      const { file_id, upload_url } = await requestUploadUrl(
        file.name,
        file.type
      );

      await uploadFileToS3(upload_url, file);

      setStage("processing");
      const result = await processFile(file_id);
      return result;
    },
    onSuccess: () => {
      setStage("done");
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

  /** Validate file type and kick off the upload pipeline */
  const handleFile = useCallback(
    (file: File) => {
      // HEIC files may not have a recognized MIME type on some browsers,
      // so also check the file extension as a fallback.
      const extension = file.name.split(".").pop()?.toLowerCase();
      const isValidType = VALID_TYPES.includes(file.type);
      const isValidExtension = [
        "pdf",
        "csv",
        "jpg",
        "jpeg",
        "png",
        "heic",
        "webp",
      ].includes(extension || "");

      if (!isValidType && !isValidExtension) {
        setError(
          "Please upload a PDF, CSV, or image file (JPG, PNG, HEIC, WebP)"
        );
        setStage("error");
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset the input so the same file can be re-selected
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
            {/* Cloud upload icon */}
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
              Drag and drop your statements, receipts, or screenshots here
            </p>

            <div className="mt-3 flex items-center justify-center gap-2">
              {/* Browse files button */}
              <label>
                <input
                  type="file"
                  className="hidden"
                  accept={ACCEPT_STRING}
                  onChange={handleInputChange}
                />
                <Button variant="secondary" type="button" onClick={() => {}}>
                  Browse Files
                </Button>
              </label>

              {/* Camera capture button (primarily for mobile) */}
              <input
                ref={cameraInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleInputChange}
              />
              <Button
                variant="secondary"
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                title="Take a photo of a receipt"
              >
                {/* Camera icon */}
                <svg
                  className="h-4 w-4 mr-1.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                  />
                </svg>
                Camera
              </Button>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              PDF, CSV, JPG, PNG, HEIC, or WebP
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
              Processing transactions...
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
