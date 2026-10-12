import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../../components/Field";
import { Modal } from "../../../components/Modal";
import { Spinner } from "../../../components/Spinner";
import { useToast } from "../../../components/toast";
import { api, apiErrorMessage } from "../../../lib/api";
import { localizedName } from "../../../lib/localized";
import type { SparePart, Supplier, Warehouse } from "../../../lib/types";
import { useStaffAuth } from "../../auth/StaffAuthContext";

export type OrderDraft = { sparePartId: string; quantity: string; supplierId: string; expectedAt: string; note: string; serviceRequestId?: string | null; warehouseId?: string };

export const emptyOrder: OrderDraft = { sparePartId: "", quantity: "1", supplierId: "", expectedAt: "", note: "" };

/** One order: part, quantity, supplier (its delivery time gives the expected date) and an optional job it is for. */
export function OrderFormModal({ draft, onClose }: { draft: OrderDraft | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrderDraft>(emptyOrder);
  useEffect(() => {
    if (draft) setForm(draft);
  }, [draft]);

  const parts = useQuery({
    queryKey: ["staff", "parts"],
    enabled: Boolean(token) && Boolean(draft),
    queryFn: () => api<{ parts: SparePart[] }>("/api/staff/catalog/parts", { token }),
  });
  const suppliers = useQuery({
    queryKey: ["staff", "suppliers"],
    enabled: Boolean(token) && Boolean(draft),
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/staff/suppliers", { token }),
  });
  const warehouses = useQuery({
    queryKey: ["staff", "warehouses", "list"],
    enabled: Boolean(token) && Boolean(draft),
    queryFn: () => api<{ warehouses: Warehouse[] }>("/api/staff/warehouses", { token }),
  });
  const chosen = (parts.data?.parts ?? []).find((part) => part.id === form.sparePartId);
  const usual = chosen?.supplierId ?? "";

  const create = useMutation({
    mutationFn: () =>
      api("/api/staff/part-orders", {
        method: "POST",
        token,
        body: JSON.stringify({
          sparePartId: form.sparePartId,
          quantity: Number(form.quantity),
          supplierId: form.supplierId || null,
          expectedAt: form.expectedAt || null,
          note: form.note || null,
          serviceRequestId: form.serviceRequestId ?? null,
          warehouseId: form.warehouseId || undefined,
        }),
      }),
    onSuccess: async () => {
      notify(t("parts.orderCreated"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
      onClose();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Modal open={Boolean(draft)} onClose={onClose} title={t("parts.newOrder")}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label={t("catalog.part")}>
          <select className={`${inputClass} bg-white`} required value={form.sparePartId} onChange={(event) => setForm({ ...form, sparePartId: event.target.value })}>
            <option value="">{t("parts.selectPart")}</option>
            {(parts.data?.parts ?? []).map((part) => (
              <option key={part.id} value={part.id}>
                {localizedName(part)} · {t("common.inStock", { count: part.stockQuantity })}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.qty")}>
            <input className={inputClass} type="number" min={1} required value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </Field>
          <Field label={t("parts.expected")} hint={t("parts.expectedHint")}>
            <input className={inputClass} type="date" value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} />
          </Field>
        </div>
        <Field label={t("parts.supplier")}>
          <select className={`${inputClass} bg-white`} value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
            <option value="">{usual ? t("parts.usualSupplier") : t("catalog.noSupplier")}</option>
            {(suppliers.data?.suppliers ?? []).filter((row) => row.isActive).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {t("parts.leadDays", { count: row.leadTimeDays })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("warehouse.deliverToLabel")} hint={t("warehouse.deliverToHint")}>
          <select className={`${inputClass} bg-white`} value={form.warehouseId ?? ""} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}>
            <option value="">{t("warehouse.deliverAuto")}</option>
            {(warehouses.data?.warehouses ?? []).filter((row) => row.isActive).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("payments.note")}>
          <input className={inputClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={200} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={create.isPending} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
            {create.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
