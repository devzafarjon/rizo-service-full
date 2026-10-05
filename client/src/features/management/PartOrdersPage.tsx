import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Named, PartOrder, SparePart } from "../../lib/types";

type Suggestion = Named & { id: string; stockQuantity: number; lowStockThreshold: number };
const FILTERS = ["open", "received", "all"] as const;

/** Spare-part orders: what is on order, what arrived, and which parts are running low with nothing ordered. */
export function PartOrdersPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [form, setForm] = useState<{ sparePartId: string; quantity: string; supplier: string; expectedAt: string; note: string } | null>(null);
  const isAdmin = user?.role === "admin";

  const list = useQuery({
    queryKey: ["staff", "part-orders", filter],
    enabled: Boolean(token),
    queryFn: () => api<{ orders: PartOrder[]; suggestions: Suggestion[] }>(`/api/staff/part-orders${filter === "all" ? "" : `?status=${filter}`}`, { token }),
  });
  const parts = useQuery({
    queryKey: ["staff", "parts"],
    enabled: Boolean(token),
    queryFn: () => api<{ parts: SparePart[] }>("/api/staff/catalog/parts", { token }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "part-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api("/api/staff/part-orders", {
        method: "POST",
        token,
        body: JSON.stringify({ sparePartId: form!.sparePartId, quantity: Number(form!.quantity), supplier: form!.supplier || null, expectedAt: form!.expectedAt || null, note: form!.note || null }),
      }),
    onSuccess: async () => {
      setForm(null);
      notify(t("parts.orderCreated"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/staff/part-orders/${id}`, { method: "PATCH", token, body: JSON.stringify({ status }) }),
    onSuccess: refresh,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  const orders = list.data?.orders ?? [];
  const suggestions = list.data?.suggestions ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("parts.ordersTitle")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("parts.ordersIntro")}</p>
        </div>
        <button type="button" onClick={() => setForm({ sparePartId: "", quantity: "1", supplier: "", expectedAt: "", note: "" })} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("parts.newOrder")}
        </button>
      </div>

      {suggestions.length > 0 ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">{t("parts.suggestions")}</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-900">
            {suggestions.map((part) => (
              <li key={part.id} className="flex items-center justify-between gap-3">
                <span>
                  {localizedName(part)} · {part.stockQuantity}/{part.lowStockThreshold}
                </span>
                <button type="button" onClick={() => setForm({ sparePartId: part.id, quantity: String(Math.max(1, part.lowStockThreshold * 2 - part.stockQuantity)), supplier: "", expectedAt: "", note: "" })} className="h-9 rounded-lg bg-white px-3 text-xs font-extrabold text-amber-900 ring-1 ring-amber-300">
                  {t("parts.order")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mb-3 inline-flex rounded-lg bg-neutral-100 p-1">
        {FILTERS.map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={`h-9 rounded-md px-4 text-sm font-bold ${filter === item ? "bg-white shadow-sm" : "text-neutral-600"}`}>
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
              <Th>{t("parts.forRequest")}</Th>
              <Th>{t("parts.supplier")}</Th>
              <Th>{t("parts.expected")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <Td className="font-semibold">{localizedName(order.part)}</Td>
                <Td>{order.quantity}</Td>
                <Td>
                  {order.request ? (
                    <Link to={`/app/requests/${order.request.id}`} className="font-mono text-xs font-semibold text-[#7B00E0] hover:underline">
                      {formatRequestId(order.request.displayId)}
                    </Link>
                  ) : (
                    t("common.dash")
                  )}
                </Td>
                <Td>{order.supplier ?? t("common.dash")}</Td>
                <Td>{order.expectedAt ? formatDate(order.expectedAt) : t("common.dash")}</Td>
                <Td>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold">{t(`parts.status.${order.status}`)}</span>
                </Td>
                <Td className="text-right">
                  {order.status === "requested" ? (
                    <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => update.mutate({ id: order.id, status: "ordered" })}>
                      {t("parts.markOrdered")}
                    </button>
                  ) : null}
                  {order.status === "requested" || order.status === "ordered" ? (
                    <>
                      <button type="button" className="mr-2 text-sm font-bold text-emerald-700" onClick={() => update.mutate({ id: order.id, status: "received" })}>
                        {t("parts.markReceived")}
                      </button>
                      {isAdmin ? (
                        <button type="button" className="text-sm font-semibold text-red-600" onClick={() => update.mutate({ id: order.id, status: "cancelled" })}>
                          {t("common.cancel")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={t("parts.newOrder")}>
        {form ? (
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
              <Field label={t("parts.expected")}>
                <input className={inputClass} type="date" value={form.expectedAt} onChange={(event) => setForm({ ...form, expectedAt: event.target.value })} />
              </Field>
            </div>
            <Field label={t("parts.supplier")}>
              <input className={inputClass} value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} maxLength={100} />
            </Field>
            <Field label={t("payments.note")}>
              <input className={inputClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={200} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={create.isPending} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
                {create.isPending ? <Spinner className="h-4 w-4" /> : null}
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
