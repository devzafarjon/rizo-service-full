import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyLocale, LOCALE_STORAGE_KEY, parseLocale, type AppLocale } from "../../i18n";
import { api, ApiError, STAFF_TOKEN_KEY } from "../../lib/api";
import type { StaffUser } from "../../lib/types";

type StaffAuthContextValue = {
  user: StaffUser | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<StaffUser>;
  logout: () => void;
  setAvailability: (isAvailable: boolean) => Promise<void>;
  saveLocale: (locale: AppLocale) => Promise<void>;
};

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STAFF_TOKEN_KEY));

  const meQuery = useQuery({
    queryKey: ["staff", "me", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const data = await api<{ user: StaffUser }>("/api/staff/auth/me", { token });
      return data.user;
    },
    retry: false,
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      localStorage.removeItem(STAFF_TOKEN_KEY);
      setToken(null);
    }
  }, [meQuery.error]);

  useEffect(() => {
    if (!meQuery.data?.locale) return;
    if (!localStorage.getItem(LOCALE_STORAGE_KEY)) {
      void applyLocale(parseLocale(meQuery.data.locale));
    }
  }, [meQuery.data?.locale]);

  const login = useCallback(async (phone: string, password: string) => {
    const data = await api<{ token: string; user: StaffUser }>("/api/staff/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
    localStorage.setItem(STAFF_TOKEN_KEY, data.token);
    setToken(data.token);
    queryClient.setQueryData(["staff", "me", data.token], data.user);
    await applyLocale(parseLocale(data.user.locale));
    return data.user;
  }, [queryClient]);

  const logout = useCallback(() => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    setToken(null);
    queryClient.removeQueries({ queryKey: ["staff"] });
  }, [queryClient]);

  const setAvailability = useCallback(
    async (isAvailable: boolean) => {
      const data = await api<{ user: StaffUser }>("/api/staff/auth/availability", {
        method: "PATCH",
        token,
        body: JSON.stringify({ isAvailable }),
      });
      queryClient.setQueryData(["staff", "me", token], data.user);
    },
    [queryClient, token],
  );

  const saveLocale = useCallback(
    async (locale: AppLocale) => {
      if (!token) return;
      queryClient.setQueryData(["staff", "me", token], (current: StaffUser | undefined) =>
        current ? { ...current, locale } : current,
      );
      const data = await api<{ user: StaffUser }>("/api/staff/auth/locale", {
        method: "PATCH",
        token,
        body: JSON.stringify({ locale }),
      });
      queryClient.setQueryData(["staff", "me", token], data.user);
    },
    [queryClient, token],
  );

  const value = useMemo<StaffAuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      token,
      loading: Boolean(token) && meQuery.isLoading,
      login,
      logout,
      setAvailability,
      saveLocale,
    }),
    [login, logout, meQuery.data, meQuery.isLoading, saveLocale, setAvailability, token],
  );

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) {
    throw new Error("useStaffAuth must be used within StaffAuthProvider");
  }
  return ctx;
}
