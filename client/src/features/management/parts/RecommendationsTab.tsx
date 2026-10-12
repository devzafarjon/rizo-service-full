import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Phone, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/EmptyState";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { useToast } from "../../../components/toast";
import { api, apiErrorMessage } from "../../../lib/api";
import { localizedName } from "../../../lib/localized";
import type { RecommendationGroup, Supplier } from "../../../lib/types";
import { useStaffAuth } from "../../auth/StaffAuthContext";

const REASON_STYLE: Record<string, string> = {
  waiting: "bg-red-50 text-red-700",
  low: "bg-amber-50 text-amber-800",
  forecast: "bg-[#F5EBFD] text-[#5A0085]",
};

/** What to buy next, grouped by supplier: pick the lines, adjust the quantities, create the orders or copy the message. */
export function RecommendationsTab() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["staff", "part-orders", "recommendations"],
    enabled: Boolean(token),
    queryFn: () => api<{ groups: RecommendationGroup[] }>("/api/staff/part-orders/recommendations", { token }),
  });
  const suppliers = useQuery({
    queryKey: ["staff", "suppliers"],
    enabled: Boolean(token),
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/staff/suppliers", { token }),
  });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});
  const [chosenSupplier, setChosenSupplier] = useState("");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const group of list.data?.groups ?? []) for (const item of group.items) next[item.part.id] = String(item.recommended);
    setQuantities(next);
  }, [list.data]);

  const groups = list.data?.groups ?? [];
  const activeSuppliers = useMemo(() => (suppliers.data?.suppliers ?? []).filter((row) => row.isActive), [suppliers.data]);

  const order = useMutation({
    mutationFn: ({ group, markOrdered }: { group: RecommendationGroup; markOrdered: boolean }) =>
      api("/api/staff/part-orders/bulk", {
        method: "POST",
        token,
        body: JSON.stringify({
          items: group.items.filter((item) => !unchecked[item.part.id]).map((item) => ({ sparePartId: item.part.id, quantity: Math.max(1, Number(quantities[item.part.id]) || item.recommended) })),
          supplierId: group.supplier?.id ?? (chosenSupplier || null),
          markOrdered,
        }),
      }),
    onSuccess: async (_data, variables) => {
      notify(variables.markOrdered ? t("parts.rec.placed") : t("parts.orderCreated"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  function messageFor(group: RecommendationGroup) {
    const lines = group.items
      .filter((item) => !unchecked[item.part.id])
      .map((item) => `• ${localizedName(item.part)} — ${t("parts.rec.pieces", { count: Math.max(1, Number(quantities[item.part.id]) || item.recommended) })}`);
    return [t("parts.rec.messageHead"), ...lines, t("parts.rec.messageTail")].join("\n");
  }
  async function copy(group: RecommendationGroup) {
    try {
      await navigator.clipboard.writeText(messageFor(group));
      notify(t("parts.rec.copied"));
    } catch {
      notify(t("parts.rec.copyFailed"), "error");
    }
  }

  if (list.isLoading) return <PageSkeleton />;
  if (groups.length === 0) return <EmptyState title={t("parts.rec.emptyTitle")} body={t("parts.rec.emptyBody")} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">{t("parts.rec.intro")}</p>
      {groups.map((group) => {
        const selected = group.items.filter((item) => !unchecked[item.part.id]);
        return (
          <section key={group.supplier?.id ?? "none"} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold">{group.supplier ? group.supplier.name : t("parts.rec.noSupplier")}</h2>
                {group.supplier ? (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-neutral-500">
                    {group.supplier.phone ? (
                      <a href={`tel:${group.supplier.phone}`} className="inline-flex items-center gap-1 hover:text-[#7B00E0]">
                        <Phone size={12} />
                        {group.supplier.phone}
                      </a>
                    ) : null}
                    {group.supplier.telegram ? <span className="inline-flex items-center gap-1"><Send size={12} />{group.supplier.telegram}</span> : null}
                    <span>{t("parts.leadDays", { count: group.supplier.leadTimeDays })}</span>
                  </p>
                ) : (
                  <select className="mt-1 h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm" value={chosenSupplier} onChange={(event) => setChosenSupplier(event.target.value)}>
                    <option value="">{t("parts.rec.chooseSupplier")}</option>
                    {activeSuppliers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copy(group)} disabled={selected.length === 0} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-xs font-extrabold hover:bg-neutral-50 disabled:opacity-50">
                  <Copy size={14} />
                  {t("parts.rec.copy")}
                </button>
                <button type="button" onClick={() => order.mutate({ group, markOrdered: false })} disabled={order.isPending || selected.length === 0} className="h-10 rounded-lg border border-[#7B00E0] px-3 text-xs font-extrabold text-[#7B00E0] disabled:opacity-50">
                  {t("parts.rec.create")}
                </button>
                <button type="button" onClick={() => order.mutate({ group, markOrdered: true })} disabled={order.isPending || selected.length === 0} className="h-10 rounded-lg bg-[#7B00E0] px-3 text-xs font-extrabold text-white disabled:opacity-50">
                  {t("parts.rec.place")}
                </button>
              </div>
            </div>

            <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {group.items.map((item) => (
                <li key={item.part.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" checked={!unchecked[item.part.id]} onChange={(event) => setUnchecked({ ...unchecked, [item.part.id]: !event.target.checked })} aria-label={localizedName(item.part)} />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-semibold">{localizedName(item.part)}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {t("parts.rec.stock")} {item.stockQuantity}/{item.lowStockThreshold}
                      {item.onOrder > 0 ? ` · ${t("parts.rec.onOrder")} ${item.onOrder}` : ""}
                      {item.waitingRequests > 0 ? ` · ${t("parts.rec.waitingJobs", { count: item.waitingRequests })}` : ""}
                      {item.avgDaily > 0 ? ` · ${t("parts.rec.usage", { count: item.avgDaily })}` : ""}
                      {item.daysCover != null ? ` · ${t("parts.rec.cover", { count: item.daysCover })}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.reasons.map((reason) => (
                        <span key={reason} className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${REASON_STYLE[reason]}`}>
                          {t(`parts.rec.reason.${reason}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                    {t("common.qty")}
                    <input
                      className="h-10 w-20 rounded-lg border border-neutral-200 px-2 text-sm"
                      type="number"
                      min={1}
                      value={quantities[item.part.id] ?? String(item.recommended)}
                      onChange={(event) => setQuantities({ ...quantities, [item.part.id]: event.target.value })}
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
