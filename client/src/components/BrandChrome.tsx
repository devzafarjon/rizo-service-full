import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RizoLogo, RizoServiceLockup } from "./RizoLogo";

/**
 * Public page frame, matching the RizoPost sign-in screen: light gray page, no app chrome.
 * "auth" pages put a large centered logo above the form; "landing" keeps the logo top-left.
 */
export function BrandChrome({
  children,
  action,
  variant = "auth",
}: {
  children: ReactNode;
  action?: ReactNode;
  variant?: "auth" | "landing";
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-[#F5F7FA] text-gray-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        {variant === "landing" ? (
          <Link to="/" className="flex min-w-0 items-center" aria-label={t("brand.service")}>
            <RizoServiceLockup />
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {action ?? (
            <Link to="/login" className="btn-rizo-ghost h-11">
              {t("common.signIn")}
            </Link>
          )}
        </div>
      </div>
      {variant === "auth" ? (
        <Link to="/" className="mx-auto mt-4 flex w-fit justify-center sm:mt-10" aria-label={t("brand.service")}>
          <RizoLogo className="h-12 w-auto sm:h-14" />
        </Link>
      ) : null}
      {children}
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-gray-500 sm:px-6">
        <Link to="/help" className="font-semibold hover:text-[#7B00E0]">
          {t("nav.help")}
        </Link>
        {" · "}
        <Link to="/privacy" className="font-semibold hover:text-[#7B00E0]">
          {t("legal.privacy")}
        </Link>
        {" · "}
        <Link to="/terms" className="font-semibold hover:text-[#7B00E0]">
          {t("legal.terms")}
        </Link>
      </footer>
    </div>
  );
}
