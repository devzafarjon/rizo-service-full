import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney, formatPhone } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Sale } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { SaleFormModal } from "./SaleFormModal";
import { usePagedList } from "../../lib/usePagedList";
import { LoadMore } from "../../components/LoadMore";

export function SalesPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const isAdmin = user?.role === "admin";
  const [warrantyAction, setWarrantyAction] = useState<{ sale: Sale; kind: "extend" | "void" } | null>(null);
  const [actionMonths, setActionMonths] = useState("3");
  const [actionReason, setActionReason] = useState("");
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const invoiceParam = params.get("invoice") ?? "";
  const [q, setQ] = useState(invoiceParam);
  const debounced = useDebouncedValue(q, 250);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Sale | null>(null);

  const filters = new URLSearchParams();
  if (invoiceParam) filters.set("invoice", invoiceParam);
  else if (debounced.trim()) filters.set("q", debounced.trim());
  const list = usePagedList<Sale>({ queryKey: ["staff", "sales", debounced, invoiceParam], path: "/api/staff/sales", params: filters, itemsKey: "sales", token });

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      if (editing) {
        return api<{ sale: Sale }>(`/api/staff/sales/${editing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(values),
        });
      }
      return api<{ sale: Sale }>("/api/staff/sales", { method: "POST", token, body: JSON.stringify(values) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "sales"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "customers"] });
      setFormOpen(false);
      setEditing(null);
      notify(editing ? t("sales.updated") : t("sales.added"));
    },
    onError: (error) => setFormError(apiErrorMessage(error, t)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/sales/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "sales"] });
      setPendingDelete(null);
      notify(t("sales.deleted"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const warrantyMutation = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "extend" | "void" | "restore" | "verify"; body?: Record<string, unknown> }) =>
      api(`/api/staff/sales/${id}/${action}`, { method: "POST", token, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: async () => {
      setWarrantyAction(null);
      setActionReason("");
      notify(t("sales.warrantyUpdated"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "sales"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const sales = list.items;
  const highlighted = useMemo(() => invoiceParam.toUpperCase(), [invoiceParam]);

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("sales.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("sales.intro")}</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setFormOpen(true);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD]"
          >
            <Plus size={16} />
            {t("sales.new")}
          </button>
        ) : null}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          className={`${inputClass} pl-10`}
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            if (invoiceParam) {
              params.delete("invoice");
              setParams(params, { replace: true });
            }
          }}
          placeholder={t("sales.searchPlaceholder")}
        />
      </div>

      {sales.length === 0 ? (
        <EmptyState title={t("sales.emptyTitle")} body={t("sales.emptyBody")} />
      ) : (
<>
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("common.invoice")}</Th>
              <Th>{t("common.customer")}</Th>
              <Th>{t("common.product")}</Th>
              <Th>{t("customers.date")}</Th>
              <Th>{t("sales.pricePaid")}</Th>
              <Th>{t("common.warranty")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr
                key={sale.id}
                className={`border-b border-neutral-100 last:border-0 ${
                  highlighted && sale.invoiceNumber.toUpperCase() === highlighted ? "bg-[#FFF4E5]" : "hover:bg-neutral-50"
                }`}
              >
                <Td className="font-semibold">
                  {sale.invoiceNumber}
                  {sale.serialNumber ? (
                    <Link to={`/app/serials/${encodeURIComponent(sale.serialNumber)}`} className="block font-mono text-xs font-medium text-[#7B00E0] hover:underline">
                      {sale.serialNumber}
                    </Link>
                  ) : null}
                </Td>
                <Td>
                  <Link to={`/app/customers/${sale.customer.id}`} className="font-medium text-[#7B00E0] hover:underline">
                    {sale.customer.name}
                  </Link>
                  <p className="text-xs text-neutral-500">{formatPhone(sale.customer.phone)}</p>
                </Td>
                <Td>
                  {localizedName(sale.product)}
                  <p className="text-xs text-neutral-500">{sale.product.sku}</p>
                </Td>
                <Td>{formatDate(sale.saleDate)}</Td>
                <Td>{formatMoney(sale.pricePaid)}</Td>
                <Td>
                  <WarrantyBadge status={sale.warrantyStatus} />
                  {sale.voided ? <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase">{t("sales.voided")}</span> : null}
                  {sale.isVerified === false ? <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">{t("sales.unverified")}</span> : null}
                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDate(sale.warrantyExpiry)}
                    {sale.extensionMonths ? ` · +${sale.extensionMonths}` : ""}
                  </p>
                </Td>
                <Td className="text-right">
                  <Link
                    to={`/app/requests/new?saleId=${sale.id}`}
                    className="mr-2 text-sm font-semibold text-[#7B00E0] hover:underline"
                  >
                    {t("sales.request")}
                  </Link>
                  <Link to={`/app/sales/${sale.id}/warranty-card`} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]">
                    <Printer size={13} />
                    {t("sales.warrantyCard")}
                  </Link>
                  {isAdmin ? (
                    <>
                      {sale.isVerified === false ? (
                        <button type="button" className="mr-2 text-sm font-bold text-emerald-700" onClick={() => warrantyMutation.mutate({ id: sale.id, action: "verify" })}>
                          {t("sales.verify")}
                        </button>
                      ) : null}
                      {sale.voided ? (
                        <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => warrantyMutation.mutate({ id: sale.id, action: "restore" })}>
                          {t("sales.restore")}
                        </button>
                      ) : (
                        <>
                          <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => setWarrantyAction({ sale, kind: "extend" })}>
                            {t("sales.extend")}
                          </button>
                          <button type="button" className="mr-2 text-sm font-semibold text-amber-700" onClick={() => setWarrantyAction({ sale, kind: "void" })}>
                            {t("sales.void")}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]"
                        onClick={() => {
                          setEditing(sale);
                          setFormError(null);
                          setFormOpen(true);
                        }}
                      >
                        {t("common.edit")}
                      </button>
                      <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setPendingDelete(sale)}>
                        {t("common.delete")}
                      </button>
                    </>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
        <LoadMore shown={sales.length} total={list.total} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} />
</>
      )}

      <SaleFormModal
        open={formOpen}
        sale={editing}
        pending={save.isPending}
        error={formError}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          await save.mutateAsync(values);
        }}
      />
      <Modal open={Boolean(warrantyAction)} onClose={() => setWarrantyAction(null)} title={warrantyAction?.kind === "extend" ? t("sales.extendTitle") : t("sales.voidTitle")}>
        {warrantyAction ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              warrantyMutation.mutate({
                id: warrantyAction.sale.id,
                action: warrantyAction.kind,
                body: warrantyAction.kind === "extend" ? { months: Number(actionMonths), reason: actionReason } : { reason: actionReason },
              });
            }}
          >
            <p className="text-sm text-neutral-600">{warrantyAction.kind === "extend" ? t("sales.extendHint") : t("sales.voidHint")}</p>
            {warrantyAction.kind === "extend" ? (
              <Field label={t("sales.extendMonths")}>
                <input className={inputClass} type="number" min={1} max={60} value={actionMonths} onChange={(event) => setActionMonths(event.target.value)} required />
              </Field>
            ) : null}
            <Field label={t("sales.reason")}>
              <input className={inputClass} required maxLength={200} value={actionReason} onChange={(event) => setActionReason(event.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWarrantyAction(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={warrantyMutation.isPending || !actionReason.trim()} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-50">
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("sales.deleteTitle")}
        body={pendingDelete ? t("sales.deleteBody", { invoice: pendingDelete.invoiceNumber }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </div>
  );
}
