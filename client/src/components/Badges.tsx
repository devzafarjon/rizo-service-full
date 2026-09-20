import { useTranslation } from "react-i18next";
import type { LocationType, Priority, ServiceType, WarrantyStatus } from "../lib/types";
import { statusLabel } from "../lib/status";

const badgeClass = "inline-flex rounded-full px-2.5 py-1 text-xs font-bold";

export function WarrantyBadge({ status }: { status: WarrantyStatus }) {
  const { t } = useTranslation();
  if (status === "in_warranty") {
    return <span className={`${badgeClass} bg-emerald-50 text-emerald-700`}>{t("warranty.in_warranty")}</span>;
  }
  if (status === "expired") {
    return <span className={`${badgeClass} bg-[#FFF4E5] text-[#C56A00]`}>{t("warranty.expired")}</span>;
  }
  return <span className={`${badgeClass} bg-neutral-100 text-neutral-600`}>{t("warranty.not_applicable")}</span>;
}

export function TypeBadge({ type }: { type: ServiceType }) {
  const { t } = useTranslation();
  const styles: Record<ServiceType, string> = {
    installation: "bg-[#F3E8FF] text-[#B439FD]",
    repair: "bg-[#FFF4E5] text-[#C56A00]",
  };
  return <span className={`${badgeClass} ${styles[type]}`}>{t(`type.${type}`)}</span>;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-[#F3E8FF] text-[#B439FD]",
  received: "bg-[#F3E8FF] text-[#B439FD]",
  diagnosing: "bg-[#FFF4E5] text-[#C56A00]",
  repairing: "bg-[#FFF4E5] text-[#C56A00]",
  in_progress: "bg-[#FFF4E5] text-[#C56A00]",
  awaiting_parts: "bg-amber-50 text-amber-800",
  ready_for_pickup: "bg-sky-50 text-sky-800",
  replaced: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  closed: "bg-emerald-50 text-emerald-700",
  paused: "bg-neutral-100 text-neutral-600",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${badgeClass} ${STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  const styles: Record<Priority, string> = {
    low: "bg-neutral-100 text-neutral-600",
    medium: "bg-[#F3E8FF] text-[#B439FD]",
    high: "bg-[#FFF4E5] text-[#C56A00]",
    urgent: "bg-red-50 text-red-700",
  };
  return <span className={`${badgeClass} ${styles[priority]}`}>{t(`priority.${priority}`)}</span>;
}

export function LocationBadge({ type }: { type: LocationType }) {
  const { t } = useTranslation();
  return <span className={`${badgeClass} bg-neutral-100 text-neutral-700`}>{t(`location.${type}`)}</span>;
}
