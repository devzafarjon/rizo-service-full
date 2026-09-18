import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RizoLogo } from "./RizoLogo";

export function BrandChrome({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="bg-black md:p-4">
        <div className="mx-auto flex h-10 max-w-6xl items-center justify-end px-4 sm:px-6">
          <LanguageSwitcher variant="dark" />
        </div>
        <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <RizoLogo className="h-8 w-auto" />
            <span className="hidden truncate text-sm font-bold text-gray-600 sm:inline">{t("brand.service")}</span>
          </Link>
          {action ?? (
            <Link to="/login" className="btn-rizo-ghost">
              {t("common.signIn")}
            </Link>
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}
