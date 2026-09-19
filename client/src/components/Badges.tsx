import { useTranslation } from "react-i18next";
import type { LocationType, Priority, ServiceType, WarrantyStatus } from "../lib/types";
import { statusLabel } from "../lib/status";

export function WarrantyBadge({ status }: { status: WarrantyStatus }) {
  const { t } = useTranslation();
  if (status === "in_warranty") {
    return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{t("warranty.in_warranty")}</span>;
  }
  if (status === "expired") {
    return <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">{t("warranty.expired")}</span>;
  }
  return <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">{t("warranty.not_applicable")}</span>;
}

export function TypeBadge({ type }: { type: ServiceType }) {
  const { t } = useTranslation();
  const styles: Record<ServiceType, string> = {
    installation: "bg-[#F3E8FF] text-[#B439FD]",
    repair: "bg-[#FFF4E5] text-[#C56A00]",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[type]}`}>{t(`type.${type}`)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700">
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
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[priority]}`}>{t(`priority.${priority}`)}</span>;
}

export function LocationBadge({ type }: { type: LocationType }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700">
      {t(`location.${type}`)}
    </span>
  );
}
