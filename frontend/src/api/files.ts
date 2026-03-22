import axios from "axios";
import apiClient from "./client";

interface UploadResponse {
  file_id: string;
  upload_url: string;
}

export interface FileRecord {
  file_id: string;
  original_filename: string;
  file_type: string;
  status: string;
  upload_date: string;
  transaction_count: number;
}

export async function requestUploadUrl(
  filename: string,
  contentType: string
): Promise<UploadResponse> {
  const { data } = await apiClient.post<UploadResponse>("/files/upload", {
    filename,
    content_type: contentType,
  });
  return data;
}

export async function uploadFileToS3(
  url: string,
  file: File
): Promise<void> {
  await axios.put(url, file, {
    headers: { "Content-Type": file.type },
  });
}

export async function processFile(fileId: string): Promise<FileRecord> {
  const { data } = await apiClient.post<FileRecord>(
    `/files/${fileId}/process`
  );
  return data;
}

export async function listFiles(): Promise<FileRecord[]> {
  const { data } = await apiClient.get<FileRecord[]>("/files");
  return data;
}

export async function deleteFile(fileId: string): Promise<{ deleted_transactions: number }> {
  const { data } = await apiClient.delete<{ deleted_transactions: number }>(
    `/files/${fileId}`
  );
  return data;
}
