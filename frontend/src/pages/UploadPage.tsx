import FileUpload from "@/components/files/FileUpload";
import FileList from "@/components/files/FileList";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Upload Statements</h1>
      <FileUpload />
      <FileList />
    </div>
  );
}
