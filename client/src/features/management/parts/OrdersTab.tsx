import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/EmptyState";
import { Field, inputClass } from "../../../components/Field";
import { Modal } from "../../../components/Modal";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { segmentedGroupClass, segmentedItemClass } from "../../../components/segmented";
import { SurfaceTable, Td, Th } from "../../../components/SurfaceTable";
import { useToast } from "../../../components/toast";
import { api, apiErrorMessage } from "../../../lib/api";
import { formatDate, formatRequestId } from "../../../lib/format";
import { localizedName } from "../../../lib/localized";
import type { PartOrder } from "../../../lib/types";
import { useStaffAuth } from "../../auth/StaffAuthContext";

const FILTERS = ["open", "received", "all"] as const;

/** Every order: place it, receive it (all or only what came), cancel it. */
export function OrdersTab() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [receiving, setReceiving] = useState<{ order: PartOrder; quantity: string } | null>(null);
  const isAdmin = user?.role === "admin";

  const list = useQuery({
    queryKey: ["staff", "part-orders", "list", filter],
    enabled: Boolean(token),
    queryFn: () => api<{ orders: PartOrder[] }>(`/api/staff/part-orders${filter === "all" ? "" : `?status=${filter}`}`, { token }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
  };
  const update = useMutation({
    mutationFn: ({ id, status, receivedQuantity }: { id: string; status: string; receivedQuantity?: number }) =>
      api(`/api/staff/part-orders/${id}`, { method: "PATCH", token, body: JSON.stringify({ status, receivedQuantity }) }),
    onSuccess: async () => {
      setReceiving(null);
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  const orders = list.data?.orders ?? [];

  return (
    <div>
      <div className={`${segmentedGroupClass} mb-3`}>
        {FILTERS.map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={segmentedItemClass(filter === item)}>
            {t(`parts.filter.${item}`)}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState title={t("parts.noOrdersTitle")} body={t("parts.noOrdersBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("catalog.part")}</Th>
              <Th>{t("common.qty")}</Th>
              <Th>{t("warehouse.deliverToLabel")}</Th>
              <Th>{t("warehouse.askedBy")}</Th>
              <Th>{t("parts.forRequest")}</Th>
              <Th>{t("parts.expected")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <Td className="font-semibold">
                  {localizedName(order.part)}
                  <span className="block text-xs font-normal text-neutral-500">{order.supplier ?? t("common.dash")}</span>
                </Td>
                <Td>{order.quantity}</Td>
                <Td>{order.warehouse?.name ?? t("common.dash")}</Td>
                <Td>{order.requestedBy?.name ?? t("common.dash")}</Td>
                <Td>
                  {order.request ? (
                    <Link to={`/app/requests/${order.request.id}`} className="font-mono text-xs font-semibold text-[#7B00E0] hover:underline">
                      {formatRequestId(order.request.displayId)}
                    </Link>
                  ) : (
                    t("parts.forStock")
                  )}
                </Td>
                <Td>
                  {order.expectedAt ? formatDate(order.expectedAt) : t("common.dash")}
                  {order.late ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-700">{t("parts.late")}</span> : null}
                </Td>
                <Td>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold">{t(`parts.status.${order.status}`)}</span>
                </Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {order.status === "requested" ? (
                      <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => update.mutate({ id: order.id, status: "ordered" })}>
                        {t("parts.markOrdered")}
                      </button>
                    ) : null}
                    {order.status === "requested" || order.status === "ordered" ? (
                      <>
                        <button type="button" className="text-sm font-bold text-emerald-700" onClick={() => setReceiving({ order, quantity: String(order.quantity) })}>
                          {t("parts.markReceived")}
                        </button>
                        {isAdmin ? (
                          <button type="button" className="text-sm font-semibold text-red-600" onClick={() => update.mutate({ id: order.id, status: "cancelled" })}>
                            {t("common.cancel")}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <Modal open={Boolean(receiving)} onClose={() => setReceiving(null)} title={t("parts.receiveTitle")}>
        {receiving ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({ id: receiving.order.id, status: "received", receivedQuantity: Number(receiving.quantity) });
            }}
          >
            <p className="text-sm font-semibold">
              {localizedName(receiving.order.part)} · {t("parts.orderedQty", { count: receiving.order.quantity })}
            </p>
            <Field label={t("parts.receivedQty")} hint={t("parts.receivedQtyHint")}>
              <input
                className={inputClass}
                type="number"
                min={1}
                max={receiving.order.quantity}
                required
                value={receiving.quantity}
                onChange={(event) => setReceiving({ ...receiving, quantity: event.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReceiving(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={update.isPending} className="inline-flex h-12 items-center rounded-lg bg-emerald-700 px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
                {t("parts.markReceived")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

