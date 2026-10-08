import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { segmentedGroupClass, segmentedItemClass } from "../../components/segmented";
import { StatCard } from "../../components/StatCard";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { defaultReportQuery, downloadCsv, reportQueryString, type ReportQuery } from "../../lib/reportQuery";
import type { FeedbackReport } from "../../lib/types";
import { ReportChrome } from "./ReportChrome";

type Band = "all" | "low" | "mid" | "high";
const BANDS: Band[] = ["all", "low", "mid", "high"];
const BAND_RANGE: Record<Band, { min?: number; max?: number }> = { all: {}, low: { max: 2 }, mid: { min: 3, max: 3 }, high: { min: 4 } };

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? "fill-[#F7941E] text-[#F7941E]" : "text-neutral-300"} />
      ))}
    </span>
  );
}

/** What customers wrote after a finished job: ratings, comments and tags, with the filters the office needs to chase unhappy ones. */
export function FeedbackReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useState<ReportQuery>(() => defaultReportQuery());
  const [band, setBand] = useState<Band>("all");
  const [technicianId, setTechnicianId] = useState("");
  const [withComment, setWithComment] = useState(false);
  const [tag, setTag] = useState("");

  const params = new URLSearchParams(reportQueryString(query));
  const range = BAND_RANGE[band];
  if (range.min) params.set("minRating", String(range.min));
  if (range.max) params.set("maxRating", String(range.max));
  if (technicianId) params.set("technicianId", technicianId);
  if (withComment) params.set("withComment", "1");
  if (tag) params.set("tag", tag);

  const report = useQuery({
    queryKey: ["staff", "reports", "feedback", params.toString()],
    enabled: Boolean(token),
    placeholderData: (previous) => previous,
    queryFn: () => api<FeedbackReport>(`/api/staff/reports/feedback?${params.toString()}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState tone="error" title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  const maxCount = Math.max(1, ...data.summary.distribution.map((row) => row.count));

  return (
    <ReportChrome
      title={t("reports.nav.feedback")}
      intro={t("reports.nav.feedbackBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-feedback.csv", [
          [t("common.date"), t("common.requestId"), t("common.customer"), t("common.technician"), t("reports.feedback.rating"), t("reports.feedback.comment"), t("reports.feedback.tags")],
          ...data.items.map((row) => [
            row.createdAt.slice(0, 10),
            formatRequestId(row.request.displayId),
            row.customer.name,
            row.technician?.name ?? "",
            row.rating,
            row.comment ?? "",
            row.tags.map((item) => t(`feedback.tag.${item}`)).join(" · "),
          ]),
        ])
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("reports.feedback.average")} value={data.summary.average == null ? t("common.dash") : `${data.summary.average.toFixed(1)} / 5`} accent="orange" />
        <StatCard label={t("reports.feedback.count")} value={String(data.summary.count)} />
        <StatCard label={t("reports.feedback.withComment")} value={String(data.summary.withComment)} accent="green" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("reports.feedback.distribution")}</h2>
          <ul className="mt-3 space-y-2">
            {[...data.summary.distribution].reverse().map((row) => (
              <li key={row.rating} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 font-bold text-neutral-700">{row.rating} ★</span>
                <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <span className="block h-full rounded-full bg-[#F7941E]" style={{ width: `${(row.count / maxCount) * 100}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-neutral-600">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("reports.feedback.topTags")}</h2>
          {data.summary.tags.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">{t("reports.feedback.noTags")}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.summary.tags.map((row) => (
                <button
                  key={row.tag}
                  type="button"
                  onClick={() => setTag(tag === row.tag ? "" : row.tag)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-bold ${tag === row.tag ? "bg-[#7B00E0] text-white" : "bg-[#F5EBFD] text-[#4B0089]"}`}
                >
                  {t(`feedback.tag.${row.tag}`)}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${tag === row.tag ? "bg-white/25" : "bg-white"}`}>{row.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className={segmentedGroupClass}>
          {BANDS.map((item) => (
            <button key={item} type="button" onClick={() => setBand(item)} className={segmentedItemClass(band === item)}>
              {t(`reports.feedback.band.${item}`)}
            </button>
          ))}
        </div>
        <select className={`${inputClass} sm:w-56`} value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} aria-label={t("common.technician")}>
          <option value="">{t("reports.feedback.allTechnicians")}</option>
          {data.technicians.map((tech) => (
            <option key={tech.id} value={tech.id}>
              {tech.name}
            </option>
          ))}
        </select>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" className="h-5 w-5" checked={withComment} onChange={(event) => setWithComment(event.target.checked)} />
          {t("reports.feedback.onlyComments")}
        </label>
        {tag ? (
          <button type="button" onClick={() => setTag("")} className="text-sm font-semibold text-[#7B00E0] hover:underline">
            {t("reports.feedback.clearTag", { tag: t(`feedback.tag.${tag}`) })}
          </button>
        ) : null}
      </div>

      {data.items.length === 0 ? (
        <EmptyState title={t("reports.feedback.emptyTitle")} body={t("reports.feedback.emptyBody")} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((row) => (
            <li key={row.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${row.rating <= 2 ? "border-red-200" : "border-gray-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars value={row.rating} />
                  <span className="text-sm font-extrabold text-neutral-900">{row.rating} / 5</span>
                </div>
                <span className="text-xs text-neutral-500">{formatDateTime(row.createdAt)}</span>
              </div>
              {row.comment ? <p className="mt-2 text-sm whitespace-pre-line text-neutral-800">{row.comment}</p> : <p className="mt-2 text-sm text-neutral-400">{t("reports.feedback.noComment")}</p>}
              {row.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.tags.map((item) => (
                    <span key={item} className="inline-flex rounded-full bg-[#F5EBFD] px-2.5 py-1 text-xs font-bold text-[#4B0089]">
                      {t(`feedback.tag.${item}`)}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#F2F3F7] pt-2 text-xs text-neutral-500">
                <Link to={`/app/requests/${row.request.id}`} className="font-bold text-[#7B00E0] hover:underline">
                  {formatRequestId(row.request.displayId)}
                </Link>
                <Link to={`/app/customers/${row.customer.id}`} className="font-semibold text-neutral-700 hover:text-[#7B00E0]">
                  {row.customer.name}
                </Link>
                <span>{localizedName(row.request.product)}</span>
                <span>{row.technician?.name ?? t("common.unassigned")}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {data.truncated ? <p className="mt-3 text-xs text-neutral-500">{t("reports.feedback.truncated")}</p> : null}
    </ReportChrome>
  );
}
