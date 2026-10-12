import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/EmptyState";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { api } from "../../../lib/api";
import { formatDate, formatRequestId } from "../../../lib/format";
import { localizedName } from "../../../lib/localized";
import type { WaitingRequest } from "../../../lib/types";
import { useStaffAuth } from "../../auth/StaffAuthContext";
import type { OrderDraft } from "./OrderFormModal";

/** Jobs held up by a part: what they need, what is on the way, and which have nothing ordered. */
export function WaitingTab({ onOrder }: { onOrder: (draft: OrderDraft) => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const list = useQuery({
    queryKey: ["staff", "part-orders", "waiting"],
    enabled: Boolean(token),
    refetchInterval: 60_000,
    queryFn: () => api<{ requests: WaitingRequest[] }>("/api/staff/part-orders/waiting", { token }),
  });
  if (list.isLoading) return <PageSkeleton />;
  const requests = list.data?.requests ?? [];
  if (requests.length === 0) return <EmptyState title={t("parts.waiting.emptyTitle")} body={t("parts.waiting.emptyBody")} />;

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <section key={request.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${request.noOrder ? "border-red-200" : request.late ? "border-amber-300" : "border-gray-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/app/requests/${request.id}`} className="font-mono text-sm font-extrabold text-[#7B00E0] hover:underline">
                {formatRequestId(request.displayId)}
              </Link>
              <p className="mt-0.5 text-sm font-semibold">
                {request.customer.name} · {localizedName(request.product)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
                <a href={`tel:+${request.customer.phone}`} className="inline-flex items-center gap-1 hover:text-[#7B00E0]">
                  <Phone size={12} />
                  {request.customer.phone}
                </a>
                {request.technician ? <span>{t("parts.waiting.technician")}: {request.technician.name}</span> : null}
                {request.homeWarehouse ? <span>{t("warehouse.servedFrom")}: {request.homeWarehouse.name}</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {request.noOrder ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-extrabold text-red-700">{t("parts.waiting.noOrder")}</span> : null}
              {request.late ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-800">{t("parts.late")}</span> : null}
              {request.isOverdue ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-extrabold text-red-700">{t("parts.waiting.overdue")}</span> : null}
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-700">
                {request.waitingDays === 0 ? t("parts.waiting.today") : t("parts.waiting.days", { count: request.waitingDays })}
              </span>
              {request.expectedAt ? <span className="rounded-full bg-[#F5EBFD] px-2.5 py-1 text-xs font-bold text-[#5A0085]">{t("parts.waiting.expected", { date: formatDate(request.expectedAt) })}</span> : null}
            </div>
          </div>

          {request.items.length === 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              <span>{t("parts.waiting.noItems")}</span>
              <button type="button" onClick={() => onOrder({ sparePartId: "", quantity: "1", supplierId: "", expectedAt: "", note: "", serviceRequestId: request.id })} className="h-9 rounded-lg bg-white px-3 text-xs font-extrabold ring-1 ring-red-200">
                {t("parts.order")}
              </button>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {request.items.map((item) => (
                <li key={item.part.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{localizedName(item.part)}</p>
                    <p className="text-xs text-neutral-500">
                      {t("parts.waiting.needed")} {item.needed} · {t("parts.waiting.inStock")} {item.inStock}
                      {request.homeWarehouse ? ` (${request.homeWarehouse.name}: ${item.homeStock ?? 0})` : ""} · {t("parts.waiting.onOrder")} {item.ordered}
                    </p>
                    {item.orders.length > 0 ? (
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {item.orders.map((order) => `${order.kind === "transfer" ? `${t("warehouse.transferFrom")} ${order.supplier ?? t("common.dash")}` : (order.supplier ?? t("common.dash"))} · ${order.kind === "transfer" ? t(`warehouse.status.${order.status}`) : t(`parts.status.${order.status}`)}${order.expectedAt ? ` · ${formatDate(order.expectedAt)}` : ""}${order.late ? ` · ${t("parts.late")}` : ""}`).join("; ")}
                      </p>
                    ) : null}
                  </div>
                  {item.uncovered > 0 && item.gap > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOrder({ sparePartId: item.part.id, quantity: String(Math.max(1, item.uncovered)), supplierId: "", expectedAt: "", note: "", serviceRequestId: request.id })}
                      className="h-9 rounded-lg bg-[#7B00E0] px-3 text-xs font-extrabold text-white"
                    >
                      {t("parts.order")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
