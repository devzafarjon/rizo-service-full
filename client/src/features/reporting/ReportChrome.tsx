import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { DateRangeBar } from "./DateRangeBar";
import { REPORT_GROUPS } from "./reportNav";
import type { ReportQuery } from "../../lib/reportQuery";
import { segmentedItemClass, segmentedScrollClass } from "../../components/segmented";

export function ReportChrome({
  title,
  intro,
  query,
  onChange,
  grain,
  onExport,
  children,
}: {
  title: string;
  intro: string;
  query: ReportQuery;
  onChange: (query: ReportQuery) => void;
  grain?: boolean;
  onExport: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Tabs of the group this report belongs to, plus a way back to the hub with all reports.
  const group = REPORT_GROUPS.find((entry) => entry.links.some((link) => link.to === pathname)) ?? REPORT_GROUPS[0];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{intro}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="btn-rizo-ghost"
        >
          <Download size={16} />
          {t("reports.export")}
        </button>
      </div>
      <nav className={`${segmentedScrollClass} mb-4`}>
        <NavLink to="/app/reports" end className={({ isActive }) => `shrink-0 ${segmentedItemClass(isActive, "sm")}`}>
          {t("reports.all")}
        </NavLink>
        {group.links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `shrink-0 ${segmentedItemClass(isActive, "sm")}`
            }
          >
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
      <DateRangeBar query={query} onChange={onChange} grain={grain} />
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function ReportPanel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    // On phones a panel that holds a table drops its own frame: the table already shows one card per row (no card inside a card).
    <section className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm max-md:has-[table]:border-0 max-md:has-[table]:bg-transparent max-md:has-[table]:p-0 max-md:has-[table]:shadow-none">
      {title ? <h2 className="mb-3 text-base font-bold text-neutral-900">{title}</h2> : null}
      {children}
    </section>
  );
}
