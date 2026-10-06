import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "rizo_theme";

export function storedThemeMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeMode(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0F131C" : "#F5F7FA");
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private mode: the choice lasts until the page is closed.
  }
  applyThemeMode(mode);
}

/** The saved theme (light / dark / follow the device) and a setter; follows the device while on "system". */
export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(storedThemeMode);
  useEffect(() => {
    applyThemeMode(mode);
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);
  return [mode, (next: ThemeMode) => { setThemeMode(next); setMode(next); }] as const;
}
