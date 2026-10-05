import { useTranslation } from "react-i18next";
import type { LocationType, Priority, ServiceType, WarrantyStatus } from "../lib/types";
import { customerStatusLabel, statusLabel } from "../lib/status";

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
    installation: "bg-[#F5EBFD] text-[#7B00E0]",
    repair: "bg-[#FFF4E5] text-[#C56A00]",
  };
  return <span className={`${badgeClass} ${styles[type]}`}>{t(`type.${type}`)}</span>;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-[#F5EBFD] text-[#7B00E0]",
  in_progress: "bg-[#FFF4E5] text-[#C56A00]",
  paused: "bg-neutral-100 text-neutral-600",
  completed: "bg-emerald-50 text-emerald-700",
  picked_up: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-50 text-red-700",
};

/** `friendly` swaps in the customer-facing wording used in the portal. */
export function StatusBadge({ status, friendly = false }: { status: string; friendly?: boolean }) {
  return (
    <span className={`${badgeClass} ${STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-700"}`}>
      {friendly ? customerStatusLabel(status) : statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  const styles: Record<Priority, string> = {
    low: "bg-neutral-100 text-neutral-600",
    medium: "bg-[#F5EBFD] text-[#7B00E0]",
    high: "bg-[#FFF4E5] text-[#C56A00]",
    urgent: "bg-red-50 text-red-700",
  };
  return <span className={`${badgeClass} ${styles[priority]}`}>{t(`priority.${priority}`)}</span>;
}

export function LocationBadge({ type }: { type: LocationType }) {
  const { t } = useTranslation();
  return <span className={`${badgeClass} bg-neutral-100 text-neutral-700`}>{t(`location.${type}`)}</span>;
}
