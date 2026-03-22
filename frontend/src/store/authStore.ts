import { create } from "zustand";

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  setAuth: (token: string, userId: string, email: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("ft_token"),
  userId: localStorage.getItem("ft_user_id"),
  email: localStorage.getItem("ft_email"),

  setAuth: (token, userId, email) => {
    localStorage.setItem("ft_token", token);
    localStorage.setItem("ft_user_id", userId);
    localStorage.setItem("ft_email", email);
    set({ token, userId, email });
  },

  clearAuth: () => {
    localStorage.removeItem("ft_token");
    localStorage.removeItem("ft_user_id");
    localStorage.removeItem("ft_email");
    set({ token: null, userId: null, email: null });
  },

  isAuthenticated: () => !!get().token,
}));
