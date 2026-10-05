import type { ReactNode } from "react";

// RizoPost table: white 12px card, lilac header row, centered cells, zebra rows.
export function SurfaceTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-center text-[13px] text-gray-800 [&_tbody_tr:nth-child(even)]:bg-[#FAFBFC] [&_tbody_tr]:border-t-0 [&_tbody_td]:border-b [&_tbody_td]:border-[#F2F3F7]">
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
