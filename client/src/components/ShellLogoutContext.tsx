import { createContext, useContext, type ReactNode } from "react";

type ShellLogout = {
  onLogout: () => void;
};

const ShellLogoutContext = createContext<ShellLogout | null>(null);

export function ShellLogoutProvider({ onLogout, children }: { onLogout: () => void; children: ReactNode }) {
  return <ShellLogoutContext.Provider value={{ onLogout }}>{children}</ShellLogoutContext.Provider>;
}

export function useShellLogout() {
  return useContext(ShellLogoutContext);
}
