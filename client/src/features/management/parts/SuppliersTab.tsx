import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { EmptyState } from "../../../components/EmptyState";
import { Field, inputClass } from "../../../components/Field";
import { Modal } from "../../../components/Modal";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { Spinner } from "../../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../../components/SurfaceTable";
import { useToast } from "../../../components/toast";
import { api, apiErrorMessage } from "../../../lib/api";
import type { Supplier } from "../../../lib/types";
import { useStaffAuth } from "../../auth/StaffAuthContext";

type Form = { id?: string; name: string; phone: string; telegram: string; leadTimeDays: string; note: string; isActive: boolean };
const blank: Form = { name: "", phone: "", telegram: "", leadTimeDays: "3", note: "", isActive: true };

/** Who the parts are bought from; the delivery time gives every order its expected date. */
export function SuppliersTab() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "warehouse";
  const [form, setForm] = useState<Form | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  const list = useQuery({
    queryKey: ["staff", "suppliers"],
    enabled: Boolean(token),
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/staff/suppliers", { token }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff", "suppliers"] });
  const save = useMutation({
    mutationFn: (value: Form) => {
      const body = JSON.stringify({ name: value.name, phone: value.phone || null, telegram: value.telegram || null, note: value.note || null, leadTimeDays: Number(value.leadTimeDays), isActive: value.isActive });
      return value.id ? api(`/api/staff/suppliers/${value.id}`, { method: "PATCH", token, body }) : api("/api/staff/suppliers", { method: "POST", token, body });
    },
    onSuccess: async () => {
      setForm(null);
      notify(t("parts.suppliers.saved"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const toggle = useMutation({
    mutationFn: (row: Supplier) => api(`/api/staff/suppliers/${row.id}`, { method: "PATCH", token, body: JSON.stringify({ isActive: !row.isActive }) }),
    onSuccess: refresh,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/suppliers/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
    },
    onError: (error) => {
      setPendingDelete(null);
      notify(apiErrorMessage(error, t), "error");
    },
  });

  if (list.isLoading) return <PageSkeleton />;
  const rows = list.data?.suppliers ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">{t("parts.suppliers.intro")}</p>
        {canEdit ? (
          <button type="button" onClick={() => setForm(blank)} className="inline-flex h-11 items-center rounded-lg bg-[#7B00E0] px-5 text-[12.8px] font-bold text-white">
            {t("parts.suppliers.add")}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("parts.suppliers.emptyTitle")} body={t("parts.suppliers.emptyBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("parts.suppliers.name")}</Th>
              <Th>{t("parts.suppliers.phone")}</Th>
              <Th>{t("parts.suppliers.lead")}</Th>
              <Th>{t("parts.suppliers.parts")}</Th>
              <Th>{t("common.status")}</Th>
              {canEdit ? <Th className="text-right">{t("common.actions")}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
                <Td className="font-semibold">
                  {row.name}
                  {row.note ? <span className="block text-xs font-normal text-neutral-500">{row.note}</span> : null}
                </Td>
                <Td>
                  {row.phone ?? t("common.dash")}
                  {row.telegram ? <span className="block text-xs text-neutral-500">{row.telegram}</span> : null}
                </Td>
                <Td>{t("parts.leadDays", { count: row.leadTimeDays })}</Td>
                <Td>{row.partsCount}</Td>
                <Td>{row.isActive ? t("parts.suppliers.active") : t("parts.suppliers.inactive")}</Td>
                {canEdit ? (
                  <Td className="text-right">
                    <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => setForm({ id: row.id, name: row.name, phone: row.phone ?? "", telegram: row.telegram ?? "", leadTimeDays: String(row.leadTimeDays), note: row.note ?? "", isActive: row.isActive })}>
                      {t("common.edit")}
                    </button>
                    <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => toggle.mutate(row)}>
                      {row.isActive ? t("parts.suppliers.switchOff") : t("parts.suppliers.switchOn")}
                    </button>
                    {row.ordersCount === 0 ? (
                      <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setPendingDelete(row)}>
                        {t("common.delete")}
                      </button>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? t("parts.suppliers.edit") : t("parts.suppliers.add")}>
        {form ? (
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              save.mutate(form);
            }}
          >
            <Field label={t("parts.suppliers.name")}>
              <input className={inputClass} required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("parts.suppliers.phone")}>
                <input className={inputClass} maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label={t("parts.suppliers.telegram")}>
                <input className={inputClass} maxLength={60} value={form.telegram} onChange={(event) => setForm({ ...form, telegram: event.target.value })} placeholder="@username" />
              </Field>
            </div>
            <Field label={t("parts.suppliers.lead")} hint={t("parts.suppliers.leadHint")}>
              <input className={inputClass} type="number" min={0} max={120} required value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} />
            </Field>
            <Field label={t("payments.note")}>
              <input className={inputClass} maxLength={300} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
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
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("parts.suppliers.deleteTitle")}
        body={pendingDelete ? t("parts.suppliers.deleteBody", { name: pendingDelete.name }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  );
}
