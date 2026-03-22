import { useAuthStore } from "@/store/authStore";
import { useLogout } from "@/hooks/useAuth";
import Button from "@/components/ui/Button";

export default function TopBar() {
  const email = useAuthStore((s) => s.email);
  const logout = useLogout();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-gray-800">
        Financial Analytics
      </h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">{email}</span>
        <Button variant="secondary" onClick={logout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
