import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { DateRangeBar } from "./DateRangeBar";
import { REPORT_LINKS } from "./reportNav";
import type { ReportQuery } from "../../lib/reportQuery";

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

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{intro}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-[#B439FD] ring-1 ring-neutral-200 hover:bg-[#F3E8FF]"
        >
          <Download size={16} />
          {t("reports.export")}
        </button>
      </div>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {REPORT_LINKS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `inline-flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-bold ${
                isActive ? "bg-[#F3E8FF] text-[#B439FD]" : "bg-white text-neutral-500 ring-1 ring-neutral-200"
              }`
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
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-4 text-base font-bold text-neutral-900">{title}</h2> : null}
      {children}
    </section>
  );
}
