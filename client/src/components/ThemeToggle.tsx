import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeMode, type ThemeMode } from "../lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; icon: typeof Sun }> = [
  { mode: "light", icon: Sun },
  { mode: "dark", icon: Moon },
  { mode: "system", icon: Monitor },
];

/** Light / dark / follow-the-device switch, shown next to the language switch. */
export function ThemeToggle({ variant = "staff" }: { variant?: "staff" | "portal" | "plain" | "dark" }) {
  const { t } = useTranslation();
  const [mode, setMode] = useThemeMode();
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const buttonClass =
    variant === "dark"
      ? "flex items-center rounded-lg px-2.5 py-2 text-white hover:bg-white/10"
      : "flex items-center rounded-lg px-2.5 py-2 text-gray-700 hover:bg-gray-100";

  return (
    <Menu>
      <MenuButton className={buttonClass} aria-label={t("theme.label")} title={t("theme.label")}>
        <Icon size={17} className={variant === "dark" ? "text-[#6500BD]" : "text-[#7B00E0]"} />
      </MenuButton>
      <MenuItems anchor="bottom end" className="z-[80] mt-1 w-44 rounded-lg bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
        {OPTIONS.map(({ mode: value, icon: ItemIcon }) => (
          <MenuItem key={value}>
            <button
              type="button"
              onClick={() => setMode(value)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${mode === value ? "bg-gray-100 font-bold text-[#7B00E0]" : "text-gray-700 data-focus:bg-gray-50"}`}
            >
              <ItemIcon size={15} />
              <span className="flex-1 text-left">{t(`theme.${value}`)}</span>
              {mode === value ? <Check size={14} /> : null}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
