import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ToastProvider";
import { CustomerAuthProvider } from "./features/auth/CustomerAuthContext";
import { StaffAuthProvider } from "./features/auth/StaffAuthContext";
import "./i18n";
import { parseLocale } from "./i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function I18nGate({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const locale = parseLocale(i18n.resolvedLanguage ?? i18n.language);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <div className="min-h-dvh w-full" lang={locale} data-locale={locale}>
      {children}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <StaffAuthProvider>
            <CustomerAuthProvider>
              <I18nGate>
                <App />
              </I18nGate>
            </CustomerAuthProvider>
          </StaffAuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
