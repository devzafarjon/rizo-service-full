import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { localizedName } from "../../lib/localized";
import type { RestockSuggestion } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { optionKey, SourcePicker } from "./SourcePicker";

/** Parts below the minimum with the quickest places to get them; one click sends every request. */
export function RestockTab({ warehouseId, canAct }: { warehouseId: string; canAct: boolean }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [unchecked, setUnchecked] = useState<Record<string, boolean>>({});

  const list = useQuery({
    queryKey: ["staff", "warehouses", warehouseId, "restock"],
    enabled: Boolean(token) && Boolean(warehouseId),
    queryFn: () => api<{ suggestions: RestockSuggestion[] }>(`/api/staff/warehouses/${warehouseId}/restock`, { token }),
  });
  const suggestions = list.data?.suggestions ?? [];

  useEffect(() => {
    const q: Record<string, string> = {};
    const c: Record<string, string> = {};
    for (const row of suggestions) {
      q[row.part.id] = String(row.recommended);
      const best = row.options.find((option) => option.recommended);
      if (best) c[row.part.id] = optionKey(best);
    }
    setQuantities(q);
    setChoices(c);
    setUnchecked({});
  }, [list.data]);

  const send = useMutation({
    mutationFn: () =>
      api<{ transfers: number; orders: number }>(`/api/staff/warehouses/${warehouseId}/restock`, {
        method: "POST",
        token,
        body: JSON.stringify({
          items: suggestions
            .filter((row) => !unchecked[row.part.id] && choices[row.part.id])
            .map((row) => ({ sparePartId: row.part.id, quantity: Math.max(1, Number(quantities[row.part.id]) || row.recommended), from: choices[row.part.id]!.replace("wh:", "") })),
        }),
      }),
    onSuccess: async (data) => {
      notify(t("warehouse.restockSent", { transfers: data.transfers, orders: data.orders }));
      await queryClient.invalidateQueries({ queryKey: ["staff", "warehouses"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "transfers"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  if (suggestions.length === 0) return <EmptyState title={t("warehouse.restockEmptyTitle")} body={t("warehouse.restockEmptyBody")} />;
  const chosen = suggestions.filter((row) => !unchecked[row.part.id] && choices[row.part.id]).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">{t("warehouse.restockIntro")}</p>
      {suggestions.map((row) => (
        <section key={row.part.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${unchecked[row.part.id] ? "border-neutral-200 opacity-60" : "border-neutral-200"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" disabled={!canAct} checked={!unchecked[row.part.id]} onChange={(event) => setUnchecked((prev) => ({ ...prev, [row.part.id]: !event.target.checked }))} />
              <span>
                <span className="block font-extrabold">{localizedName(row.part)}</span>
                <span className="block text-xs text-neutral-500">{t("warehouse.restockState", { have: row.quantity, min: row.effectiveMin ?? 0, coming: row.onOrder + row.incoming })}</span>
              </span>
            </label>
            <input className={`${inputClass} !w-28`} type="number" min={1} disabled={!canAct} value={quantities[row.part.id] ?? ""} onChange={(event) => setQuantities((prev) => ({ ...prev, [row.part.id]: event.target.value }))} aria-label={t("common.qty")} />
          </div>
          <SourcePicker options={row.options} value={choices[row.part.id] ?? ""} onChange={(key) => setChoices((prev) => ({ ...prev, [row.part.id]: key }))} />
        </section>
      ))}
      {canAct ? (
        <div className="flex justify-end">
          <button type="button" disabled={send.isPending || chosen === 0} onClick={() => send.mutate()} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-60">
            {send.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("warehouse.restockSend", { count: chosen })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
