import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { localizedName } from "../../lib/localized";
import type { WarehouseStockItem } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { NewRequestDialog } from "./TransferDialogs";

type Editing = { item: WarehouseStockItem; mode: "count" | "min" } | null;

/** Count or correct a shelf, or set the minimum the keeper is warned at. */
function StockDialog({ warehouseId, editing, onClose }: { warehouseId: string; editing: Editing; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (editing) {
      setValue(editing.mode === "count" ? String(editing.item.quantity) : editing.item.minQuantity == null ? "" : String(editing.item.minQuantity));
      setNote("");
    }
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const body = editing!.mode === "count" ? { quantity: Number(value), note: note || null } : { minQuantity: value === "" ? null : Number(value) };
      return api(`/api/staff/warehouses/${warehouseId}/stock/${editing!.item.part.id}`, { method: "PATCH", token, body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      notify(t("warehouse.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "warehouses"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  return (
    <Modal open={Boolean(editing)} onClose={onClose} title={editing?.mode === "count" ? t("warehouse.countTitle") : t("warehouse.minTitle")}>
      {editing ? (
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm font-semibold">{localizedName(editing.item.part)}</p>
          {editing.mode === "count" ? (
            <>
              <Field label={t("warehouse.countedQty")} hint={t("warehouse.countHint", { count: editing.item.quantity })}>
                <input className={inputClass} type="number" min={0} required value={value} onChange={(event) => setValue(event.target.value)} />
              </Field>
              <Field label={t("payments.note")}>
                <input className={inputClass} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
            </>
          ) : (
            <Field label={t("warehouse.minQty")} hint={t("warehouse.minHint")}>
              <input className={inputClass} type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={save.isPending} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
              {save.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("common.save")}
            </button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

/** What is on this warehouse's shelves, what is coming and what is already promised to others. */
export function StockTab({ warehouseId, canAct, canAsk }: { warehouseId: string; canAct: boolean; canAsk: boolean }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [stockedOnly, setStockedOnly] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["staff", "warehouses", warehouseId, "stock", q, lowOnly, stockedOnly],
    enabled: Boolean(token) && Boolean(warehouseId),
    queryFn: () => api<{ items: WarehouseStockItem[] }>(`/api/staff/warehouses/${warehouseId}/stock?q=${encodeURIComponent(q)}${lowOnly ? "&low=1" : ""}${stockedOnly ? "&stocked=1" : ""}`, { token }),
  });
  const items = list.data?.items ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className={`${inputClass} max-w-xs`} type="search" placeholder={t("common.search")} value={q} onChange={(event) => setQ(event.target.value)} />
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" checked={stockedOnly} onChange={(event) => setStockedOnly(event.target.checked)} />
          {t("warehouse.onlyStocked")}
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} />
          {t("warehouse.onlyLow")}
        </label>
      </div>
      {list.isLoading ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title={t("warehouse.noStockTitle")} body={t("warehouse.noStockBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("catalog.part")}</Th>
              <Th>{t("warehouse.onShelf")}</Th>
              <Th>{t("warehouse.min")}</Th>
              <Th>{t("warehouse.coming")}</Th>
              <Th>{t("warehouse.promised")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.part.id}>
                <Td className="font-semibold">{localizedName(item.part)}</Td>
                <Td>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${item.low ? "bg-red-50 text-red-700" : "bg-[#F5EBFD] text-[#7B00E0]"}`}>{item.quantity}</span>
                </Td>
                <Td>{item.effectiveMin ?? t("common.dash")}</Td>
                <Td>{item.onOrder + item.incoming > 0 ? item.onOrder + item.incoming : t("common.dash")}</Td>
                <Td>{item.requestedFromHere > 0 ? item.requestedFromHere : t("common.dash")}</Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {canAct ? (
                      <>
                        <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => setEditing({ item, mode: "count" })}>
                          {t("warehouse.count")}
                        </button>
                        <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => setEditing({ item, mode: "min" })}>
                          {t("warehouse.setMin")}
                        </button>
                      </>
                    ) : null}
                    {canAsk ? (
                      <button type="button" className="text-sm font-bold text-[#7B00E0]" onClick={() => setAsking(item.part.id)}>
                        {t("warehouse.ask")}
                      </button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <StockDialog warehouseId={warehouseId} editing={editing} onClose={() => setEditing(null)} />
      <NewRequestDialog open={asking !== null} toWarehouseId={warehouseId} initialPartId={asking ?? undefined} onClose={() => setAsking(null)} />
    </div>
  );
}
