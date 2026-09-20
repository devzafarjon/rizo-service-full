import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const itemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-neutral-700 data-focus:bg-neutral-100";

export function OverflowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuButton
        type="button"
        aria-label={label}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
      >
        <MoreHorizontal size={18} />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-[80] mt-1 w-52 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5"
      >
        {children}
      </MenuItems>
    </Menu>
  );
}

export function OverflowLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <MenuItem>
      <Link to={to} className={itemClass}>
        {children}
      </Link>
    </MenuItem>
  );
}

export function OverflowAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <MenuItem>
      <button type="button" onClick={onClick} className={itemClass}>
        {children}
      </button>
    </MenuItem>
  );
}
