import { FormEvent, useState } from "react";
import { AxiosError } from "axios";
import { useSignup } from "@/hooks/useAuth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function getErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.response) {
      const data = err.response.data;
      const detail = data?.detail || data?.message || JSON.stringify(data);
      return `[${err.response.status}] ${detail}`;
    }
    return `Network error: ${err.message}`;
  }
  return `Unknown error: ${String(err)}`;
}

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const signup = useSignup();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    signup.mutate({ email, password });
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
        minLength={8}
      />
      <Input
        label="Confirm Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {(error || signup.isError) && (
        <p className="text-sm text-red-600">
          {error || getErrorMessage(signup.error)}
        </p>
      )}
      <Button type="submit" loading={signup.isPending} className="w-full">
        Create Account
      </Button>
    </form>
  );
}
