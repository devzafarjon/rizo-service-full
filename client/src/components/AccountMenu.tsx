import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
  return letters.toUpperCase() || "?";
}

export function AccountMenu({
  name,
  detail,
  onLogout,
  children,
}: {
  name: string;
  detail?: string;
  onLogout: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Menu>
      <MenuButton
        className="inline-flex h-10 max-w-[12rem] items-center gap-2 rounded-lg px-1.5 hover:bg-gray-100 sm:px-2"
        aria-label={t("common.accountMenu")}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3E8FF] text-xs font-extrabold text-[#B439FD]">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 truncate text-left text-sm font-bold text-black sm:block">{name}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-400" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-[80] mt-1 w-60 rounded-lg bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
      >
        <div className="border-b border-gray-100 px-3 py-2">
          <p className="truncate text-sm font-bold text-black">{name}</p>
          {detail ? <p className="truncate text-xs text-gray-500">{detail}</p> : null}
        </div>
        {children}
        <MenuItem>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-[#B439FD] data-focus:bg-[#F3E8FF]"
          >
            <LogOut size={16} />
            {t("common.signOut")}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
