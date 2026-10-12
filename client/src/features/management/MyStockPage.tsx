import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { StockTransfer, TechnicianStockRow } from "../../lib/types";
import { VanRequestDialog } from "../warehouses/TechnicianDialogs";
import { ReceiveDialog } from "../warehouses/TransferDialogs";
import { TRANSFER_STATUS_STYLE } from "../warehouses/TransfersTab";

/** What the technician carries right now, and the parts asked from a warehouse for the van. Parts used on a job come from here first. */
export function MyStockPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [receiving, setReceiving] = useState<StockTransfer | null>(null);
  const stock = useQuery({
    queryKey: ["staff", "my-stock"],
    enabled: Boolean(token),
    queryFn: () => api<{ stock: TechnicianStockRow[] }>("/api/staff/my-jobs/stock", { token }),
  });
  const transfers = useQuery({
    queryKey: ["staff", "transfers", "mine"],
    enabled: Boolean(token),
    refetchInterval: 60_000,
    queryFn: () => api<{ transfers: StockTransfer[] }>("/api/staff/my-jobs/transfers", { token }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "transfers"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "my-stock"] });
  };
  if (stock.isLoading) return <PageSkeleton />;
  const rows = stock.data?.stock ?? [];
  const asked = transfers.data?.transfers ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("techStock.mineTitle")}</h1>
          <p className="mt-1 mb-4 text-sm text-neutral-500">{t("techStock.mineIntro")}</p>
        </div>
        <button type="button" onClick={() => setAsking(true)} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("warehouse.vanRequest")}
        </button>
      </div>
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

      {asked.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-extrabold">{t("warehouse.myRequests")}</h2>
          <ul className="space-y-2">
            {asked.map((transfer) => (
              <li key={transfer.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {localizedName(transfer.part)} × {transfer.quantity}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {transfer.from.name}
                    {transfer.etaAt ? ` · ${formatDate(transfer.etaAt)}` : ""}
                    {transfer.rejectionReason ? ` · ${transfer.rejectionReason}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TRANSFER_STATUS_STYLE[transfer.status]}`}>{t(`warehouse.status.${transfer.status}`)}</span>
                  {transfer.status === "shipped" ? (
                    <button type="button" className="text-sm font-bold text-emerald-700" onClick={() => setReceiving(transfer)}>
                      {t("warehouse.receive")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <VanRequestDialog open={asking} onClose={() => setAsking(false)} onDone={refresh} />
      <ReceiveDialog transfer={receiving} mine onClose={() => setReceiving(null)} />
    </div>
  );
}
