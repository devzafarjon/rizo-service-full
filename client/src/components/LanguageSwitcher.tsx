import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { applyLocale, APP_LOCALES, type AppLocale, parseLocale } from "../i18n";
import { useCustomerAuth } from "../features/auth/CustomerAuthContext";
import { useStaffAuth } from "../features/auth/StaffAuthContext";

export function LanguageSwitcher({
  variant = "staff",
}: {
  variant?: "staff" | "portal" | "plain" | "dark";
}) {
  const { i18n, t } = useTranslation();
  const staff = useStaffAuth();
  const customer = useCustomerAuth();
  const current = parseLocale(i18n.resolvedLanguage ?? i18n.language);

  async function select(locale: AppLocale) {
    await applyLocale(locale);
    const saves: Promise<void>[] = [];
    if (staff.token) saves.push(staff.saveLocale(locale));
    if (customer.token) saves.push(customer.saveLocale(locale));
    if (saves.length) {
      try {
        await Promise.all(saves);
      } catch {
        // Keep the on-device choice even if the account save fails.
      }
    }
  }

  const buttonClass =
    variant === "dark"
      ? "flex items-center gap-2 rounded-lg px-3 py-2 text-white hover:bg-white/10"
      : "flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100";

  return (
    <Menu>
      <MenuButton className={buttonClass} aria-label={t("common.language")}>
        <Globe size={16} className={variant === "dark" ? "text-[#C45FFF]" : "text-[#B439FD]"} />
        <span className="text-sm font-medium uppercase">{current}</span>
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-[80] mt-1 w-40 rounded-lg bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
      >
        {APP_LOCALES.map((locale) => (
          <MenuItem key={locale}>
            <button
              type="button"
              onClick={() => void select(locale)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
                current === locale ? "bg-gray-100 font-bold text-[#B439FD]" : "text-gray-700 data-focus:bg-gray-50"
              }`}
            >
              <span>{t(`languages.${locale}`)}</span>
              <span className="text-xs uppercase text-gray-400">{locale}</span>
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
