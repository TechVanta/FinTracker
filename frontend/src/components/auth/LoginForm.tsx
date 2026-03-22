import { FormEvent, useState } from "react";
import { AxiosError } from "axios";
import { useLogin } from "@/hooks/useAuth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError && err.response?.data?.detail) {
    return String(err.response.data.detail);
  }
  return "Login failed. Please try again.";
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {login.isError && (
        <p className="text-sm text-red-600">
          {getErrorMessage(login.error)}
        </p>
      )}
      <Button type="submit" loading={login.isPending} className="w-full">
        Sign In
      </Button>
    </form>
  );
}
