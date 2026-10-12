import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { segmentedGroupClass, segmentedItemClass } from "../../components/segmented";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { StockTransfer } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { NewRequestDialog, ReceiveDialog, RejectDialog, ShipDialog } from "./TransferDialogs";

export const TRANSFER_STATUS_STYLE: Record<string, string> = {
  requested: "bg-amber-50 text-amber-800",
  shipped: "bg-[#F5EBFD] text-[#5A0085]",
  received: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-600",
};

/**
 * Requests this warehouse has to answer (`out`) or is waiting for (`in`).
 * `canAct` = the person runs this warehouse (send, refuse); `canReceive` = may confirm that goods arrived.
 */
export function TransfersTab({ warehouseId, direction, canAct, canReceive }: { warehouseId: string; direction: "out" | "in"; canAct: boolean; canReceive: boolean }) {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"open" | "history">("open");
  const [shipping, setShipping] = useState<StockTransfer | null>(null);
  const [receiving, setReceiving] = useState<StockTransfer | null>(null);
  const [rejecting, setRejecting] = useState<StockTransfer | null>(null);
  const [asking, setAsking] = useState(false);

  const list = useQuery({
    queryKey: ["staff", "transfers", warehouseId, direction, filter],
    enabled: Boolean(token) && Boolean(warehouseId),
    refetchInterval: 60_000,
    queryFn: () => api<{ transfers: StockTransfer[] }>(`/api/staff/transfers?warehouseId=${warehouseId}&direction=${direction}&status=${filter}`, { token }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/staff/transfers/${id}/cancel`, { method: "POST", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "transfers"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "warehouses"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const rows = list.data?.transfers ?? [];
  const isOut = direction === "out";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className={segmentedGroupClass}>
          {(["open", "history"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={segmentedItemClass(filter === item)}>
              {t(`warehouse.filter.${item}`)}
            </button>
          ))}
        </div>
        {!isOut && user?.role !== "accountant" ? (
          <button type="button" onClick={() => setAsking(true)} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
            {t("warehouse.newRequest")}
          </button>
        ) : null}
      </div>

      {list.isLoading ? (
        <PageSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title={t(isOut ? "warehouse.noOutTitle" : "warehouse.noInTitle")} body={t(isOut ? "warehouse.noOutBody" : "warehouse.noInBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("catalog.part")}</Th>
              <Th>{t("common.qty")}</Th>
              <Th>{isOut ? t("warehouse.to") : t("warehouse.from")}</Th>
              <Th>{t("warehouse.askedBy")}</Th>
              <Th>{t("parts.forRequest")}</Th>
              <Th>{t("parts.expected")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mine = row.requestedBy.id === user?.id;
              return (
                <tr key={row.id}>
                  <Td className="font-semibold">
                    {localizedName(row.part)}
                    <span className="block text-xs font-normal text-neutral-500">{formatDateTime(row.createdAt)}</span>
                  </Td>
                  <Td>{row.quantity}</Td>
                  <Td>{isOut ? (row.to?.name ?? row.toTechnician?.name ?? t("common.dash")) : row.from.name}</Td>
                  <Td>
                    {row.requestedBy.name ?? t("common.dash")}
                    {row.requestedBy.role ? <span className="block text-xs text-neutral-500">{t(`staffAdmin.roles.${row.requestedBy.role}`, { defaultValue: row.requestedBy.role })}</span> : null}
                  </Td>
                  <Td>
                    {row.request ? (
                      <Link to={`/app/requests/${row.request.id}`} className="font-mono text-xs font-semibold text-[#7B00E0] hover:underline">
                        {formatRequestId(row.request.displayId)}
                      </Link>
                    ) : (
                      t("parts.forStock")
                    )}
                  </Td>
                  <Td>
                    {row.etaAt ? formatDate(row.etaAt) : t("common.dash")}
                    {row.late ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-700">{t("parts.late")}</span> : null}
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TRANSFER_STATUS_STYLE[row.status]}`}>{t(`warehouse.status.${row.status}`)}</span>
                    {row.rejectionReason ? <span className="mt-1 block text-xs font-normal text-neutral-500">{row.rejectionReason}</span> : null}
                  </Td>
                  <Td className="text-right">
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                      {row.status === "requested" && isOut && canAct ? (
                        <>
                          <button type="button" className="text-sm font-bold text-emerald-700" onClick={() => setShipping(row)}>
                            {t("warehouse.ship")}
                          </button>
                          <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setRejecting(row)}>
                            {t("warehouse.reject")}
                          </button>
                        </>
                      ) : null}
                      {row.status === "shipped" && !isOut && canReceive ? (
                        <button type="button" className="text-sm font-bold text-emerald-700" onClick={() => setReceiving(row)}>
                          {t("warehouse.receive")}
                        </button>
                      ) : null}
                      {row.status === "requested" && (mine || (!isOut && canAct)) ? (
                        <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-red-600" disabled={cancel.isPending} onClick={() => cancel.mutate(row.id)}>
                          {t("common.cancel")}
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </SurfaceTable>
      )}

      <ShipDialog transfer={shipping} onClose={() => setShipping(null)} />
      <ReceiveDialog transfer={receiving} onClose={() => setReceiving(null)} />
      <RejectDialog transfer={rejecting} onClose={() => setRejecting(null)} />
      <NewRequestDialog open={asking} toWarehouseId={warehouseId} onClose={() => setAsking(false)} />
    </div>
  );
}
