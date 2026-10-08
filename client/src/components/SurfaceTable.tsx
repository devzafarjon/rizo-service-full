import { useEffect, useRef, type ReactNode } from "react";

// RizoPost table: white 12px card, lilac header row, centered cells, zebra rows.
//
// On phones (below md) the same markup turns into one card per row: the header row is hidden, every cell shows its column
// name above its value (copied from the header into `data-label` below), two cells per line, and the last cell (usually the
// actions) spans the full width. So no table needs its own phone layout and none scrolls sideways.
const PHONE_CARDS = [
  "max-md:[&_thead]:hidden",
  "max-md:block max-md:[&_tbody]:block",
  "max-md:[&_tbody_tr]:mb-3 max-md:[&_tbody_tr]:grid max-md:[&_tbody_tr]:grid-cols-2 max-md:[&_tbody_tr]:gap-x-3 max-md:[&_tbody_tr]:rounded-2xl max-md:[&_tbody_tr]:border max-md:[&_tbody_tr]:border-gray-200 max-md:[&_tbody_tr]:bg-white! max-md:[&_tbody_tr]:p-3 max-md:[&_tbody_tr]:shadow-sm",
  "max-md:[&_tbody_td]:block max-md:[&_tbody_td]:min-w-0 max-md:[&_tbody_td]:border-b-0! max-md:[&_tbody_td]:px-1 max-md:[&_tbody_td]:py-1.5 max-md:[&_tbody_td]:text-left max-md:[&_tbody_td]:whitespace-normal max-md:[&_tbody_td]:break-words",
  "max-md:[&_tbody_td:last-child]:col-span-2",
  // The first cell is the row's identity (name, number): a heading across the card, without its column label.
  "max-md:[&_tbody_td:first-child]:col-span-2 max-md:[&_tbody_td:first-child]:text-[15px] max-md:[&_tbody_td:first-child]:font-bold max-md:[&_tbody_td:first-child]:before:hidden",
  "max-md:[&_tbody_td]:before:mb-0.5 max-md:[&_tbody_td]:before:block max-md:[&_tbody_td]:before:text-[11px] max-md:[&_tbody_td]:before:font-bold max-md:[&_tbody_td]:before:tracking-wide max-md:[&_tbody_td]:before:text-gray-500 max-md:[&_tbody_td]:before:uppercase max-md:[&_tbody_td]:before:content-[attr(data-label)]",
  "max-md:[&_tbody_td[data-label='']]:before:hidden",
].join(" ");

export function SurfaceTable({ children }: { children: ReactNode }) {
  const table = useRef<HTMLTableElement>(null);

  // Runs after every render, so labels follow rows that were added, reordered or translated.
  useEffect(() => {
    const element = table.current;
    if (!element) return;
    const labels = [...element.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
    element.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        const label = (cell as HTMLTableCellElement).colSpan > 1 ? "" : (labels[index] ?? "");
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      });
    });
  });

  return (
    <div className="rounded-2xl bg-white shadow-sm md:overflow-x-auto md:border md:border-gray-200 max-md:bg-transparent max-md:shadow-none">
      <table
        ref={table}
        className={`min-w-full text-center text-[13px] text-gray-800 [&_tbody_tr:nth-child(even)]:bg-[#FAFBFC] [&_tbody_tr]:border-t-0 [&_tbody_td]:border-b [&_tbody_td]:border-[#F2F3F7] ${PHONE_CARDS}`}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b-2 border-[#E0CDF2] bg-[#F3E8FB] px-3 py-2.5 text-[12.8px] font-bold tracking-[0.04em] text-[#4B5563] uppercase ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-[13px] ${className}`}>{children}</td>;
}
