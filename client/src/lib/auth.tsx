import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./queryClient";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type AuthContextValue = {
  user: AccountUser | null;
  /** Per-browser id used to key guest (logged-out) data. */
  guestId: string | null;
  isLoading: boolean;
  signup: (data: { name: string; email: string; password: string }) => Promise<AccountUser>;
  login: (data: { email: string; password: string }) => Promise<AccountUser>;
  logout: () => Promise<void>;
  /** The bucket the server stores this browser's data under. */
  accountKey: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function refreshPersonalData() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery<{ user: AccountUser | null; guestId: string | null }>({
    queryKey: ["/api/auth/me"],
    staleTime: 60_000,
  });

  const signupMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/signup", payload);
      return res.json() as Promise<{ user: AccountUser }>;
    },
    onSuccess: refreshPersonalData,
  });

  const loginMutation = useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", payload);
      return res.json() as Promise<{ user: AccountUser }>;
    },
    onSuccess: refreshPersonalData,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: refreshPersonalData,
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: data?.user ?? null,
    guestId: data?.guestId ?? null,
    isLoading,
    accountKey: data?.user?.id ?? data?.guestId ?? null,
    signup: async payload => (await signupMutation.mutateAsync(payload)).user,
    login: async payload => (await loginMutation.mutateAsync(payload)).user,
    logout: async () => { await logoutMutation.mutateAsync(); },
  }), [data?.user, data?.guestId, isLoading, loginMutation, logoutMutation, signupMutation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
