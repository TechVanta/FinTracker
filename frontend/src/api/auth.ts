import apiClient from "./client";

interface AuthResponse {
  token: string;
  user_id: string;
  email: string;
}

export async function loginApi(
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/login", {
    email,
    password,
  });
  return data;
}

export async function signupApi(
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/signup", {
    email,
    password,
  });
  return data;
}
