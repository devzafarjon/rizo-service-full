import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { localizedName } from "../../lib/localized";
import type { TechnicianStockRow } from "../../lib/types";

/** What the technician carries right now. Parts used on a job come from here first. */
export function MyStockPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const stock = useQuery({
    queryKey: ["staff", "my-stock"],
    enabled: Boolean(token),
    queryFn: () => api<{ stock: TechnicianStockRow[] }>("/api/staff/my-jobs/stock", { token }),
  });
  if (stock.isLoading) return <PageSkeleton />;
  const rows = stock.data?.stock ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("techStock.mineTitle")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("techStock.mineIntro")}</p>
      {rows.length === 0 ? (
        <EmptyState title={t("techStock.mineEmpty")} body={t("techStock.mineEmptyBody")} />
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {rows.map((row) => (
            <li key={row.sparePartId} className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">{localizedName(row)}</span>
              <span className="rounded-full bg-[#F5EBFD] px-3 py-1 text-sm font-bold text-[#7B00E0]">{row.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
