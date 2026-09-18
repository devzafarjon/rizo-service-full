import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
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

export function SalesPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
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

  const list = useQuery({
    queryKey: ["staff", "sales", debounced, invoiceParam],
    enabled: Boolean(token),
    queryFn: () => {
      const search = new URLSearchParams();
      if (invoiceParam) search.set("invoice", invoiceParam);
      else if (debounced.trim()) search.set("q", debounced.trim());
      const suffix = search.toString() ? `?${search}` : "";
      return api<{ sales: Sale[] }>(`/api/staff/sales${suffix}`, { token });
    },
  });

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

  const sales = list.data?.sales ?? [];
  const highlighted = useMemo(() => invoiceParam.toUpperCase(), [invoiceParam]);

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("sales.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("sales.intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setFormOpen(true);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
        >
          <Plus size={16} />
          {t("sales.new")}
        </button>
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
                <Td className="font-semibold">{sale.invoiceNumber}</Td>
                <Td>
                  <Link to={`/app/customers/${sale.customer.id}`} className="font-medium text-[#B439FD] hover:underline">
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
                  <p className="mt-1 text-xs text-neutral-500">{formatDate(sale.warrantyExpiry)}</p>
                </Td>
                <Td className="text-right">
                  <Link
                    to={`/app/requests/new?saleId=${sale.id}`}
                    className="mr-2 text-sm font-semibold text-[#B439FD] hover:underline"
                  >
                    {t("sales.request")}
                  </Link>
                  <button
                    type="button"
                    className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#B439FD]"
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
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
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
