import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyLocale, LOCALE_STORAGE_KEY, parseLocale, type AppLocale } from "../../i18n";
import i18n from "../../i18n";
import { api, ApiError, CUSTOMER_TOKEN_KEY } from "../../lib/api";
import type { CustomerUser } from "../../lib/types";

type CustomerAuthContextValue = {
  user: CustomerUser | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<CustomerUser>;
  signup: (values: { name: string; phone: string; password: string; address?: string }) => Promise<CustomerUser>;
  forgotPassword: (phone: string) => Promise<{ temporaryPassword: string; message: string }>;
  logout: () => void;
  saveLocale: (locale: AppLocale) => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(CUSTOMER_TOKEN_KEY));

  const meQuery = useQuery({
    queryKey: ["customer", "me", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const data = await api<{ user: CustomerUser }>("/api/customer/auth/me", { token });
      return data.user;
    },
    retry: false,
  });

  useEffect(() => {
    if (meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
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
    const data = await api<{ token: string; user: CustomerUser }>("/api/customer/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
    localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
    setToken(data.token);
    queryClient.setQueryData(["customer", "me", data.token], data.user);
    await applyLocale(parseLocale(data.user.locale));
    return data.user;
  }, [queryClient]);

  const signup = useCallback(
    async (values: { name: string; phone: string; password: string; address?: string }) => {
      const data = await api<{ token: string; user: CustomerUser }>("/api/customer/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...values, locale: parseLocale(i18n.language) }),
      });
      localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
      setToken(data.token);
      queryClient.setQueryData(["customer", "me", data.token], data.user);
      await applyLocale(parseLocale(data.user.locale));
      return data.user;
    },
    [queryClient],
  );

  const forgotPassword = useCallback(async (phone: string) => {
    return api<{ temporaryPassword: string; message: string }>("/api/customer/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    setToken(null);
    queryClient.removeQueries({ queryKey: ["customer"] });
  }, [queryClient]);

  const saveLocale = useCallback(
    async (locale: AppLocale) => {
      if (!token) return;
      queryClient.setQueryData(["customer", "me", token], (current: CustomerUser | undefined) =>
        current ? { ...current, locale } : current,
      );
      const data = await api<{ user: CustomerUser }>("/api/customer/auth/locale", {
        method: "PATCH",
        token,
        body: JSON.stringify({ locale }),
      });
      queryClient.setQueryData(["customer", "me", token], data.user);
    },
    [queryClient, token],
  );

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      user: meQuery.data ?? null,
      token,
      loading: Boolean(token) && meQuery.isLoading,
      login,
      signup,
      forgotPassword,
      logout,
      saveLocale,
    }),
    [forgotPassword, login, logout, meQuery.data, meQuery.isLoading, saveLocale, signup, token],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  }
  return ctx;
}
