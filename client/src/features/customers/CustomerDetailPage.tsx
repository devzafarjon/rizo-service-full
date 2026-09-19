import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatDateTime, formatMoney, formatPhone, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { regionLabel } from "../../lib/regions";
import { outcomeLabel } from "../../lib/status";
import type { CustomerRequest, CustomerSale, StaffCustomer } from "../../lib/types";
import { CustomerFormModal } from "./CustomerFormModal";
import { SaleFormModal } from "../sales/SaleFormModal";

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["staff", "customers", id],
    enabled: Boolean(token && id),
    queryFn: () =>
      api<{ customer: StaffCustomer; sales: CustomerSale[]; requests: CustomerRequest[] }>(`/api/staff/customers/${id}`, {
        token,
      }),
  });

  const save = useMutation({
    mutationFn: (values: { name: string; phone: string; address?: string; regionCode?: string; notes?: string; password?: string }) =>
      api(`/api/staff/customers/${id}`, { method: "PATCH", token, body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "customers"] });
      setEditOpen(false);
      notify(t("customers.updated"));
    },
    onError: (error) => setFormError(apiErrorMessage(error, t)),
  });

  const createSale = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api("/api/staff/sales", { method: "POST", token, body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff"] });
      setSaleOpen(false);
      notify(t("sales.added"));
    },
    onError: (error) => setSaleError(apiErrorMessage(error, t)),
  });

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const customer = detail.data?.customer;
  if (!customer) {
    return <EmptyState title={t("errors.customerNotFound")} body={t("customers.notFoundBody")} />;
  }

  const sales = detail.data?.sales ?? [];
  const requests = detail.data?.requests ?? [];

  return (
    <div>
      <Link to="/app/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#B439FD]">
        <ArrowLeft size={16} />
        {t("customers.all")}
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{customer.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{formatPhone(customer.phone)}</p>
          <p className="mt-1 text-sm text-neutral-500">{customer.address || t("customers.noAddress")}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {regionLabel(customer.regionCode)} ({customer.regionCode})
          </p>
          {customer.notes ? <p className="mt-3 max-w-xl text-sm text-neutral-700">{customer.notes}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/requests/new?customerId=${customer.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white"
          >
            <Plus size={16} />
            {t("requests.new")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditOpen(true);
            }}
            className="h-11 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#B439FD]"
          >
            {t("customers.editProfile")}
          </button>
          <button
            type="button"
            onClick={() => {
              setSaleError(null);
              setSaleOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#B439FD]"
          >
            <Plus size={16} />
            {t("customers.addSale")}
          </button>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">{t("customers.purchases")}</h2>
        {sales.length === 0 ? (
          <EmptyState title={t("customers.noSales")} body={t("customers.noPurchasesBody")} />
        ) : (
          <SurfaceTable>
            <thead>
              <tr className="border-b border-neutral-100">
                <Th>{t("common.invoice")}</Th>
                <Th>{t("common.product")}</Th>
                <Th>{t("customers.date")}</Th>
                <Th>{t("common.price")}</Th>
                <Th>{t("common.warranty")}</Th>
                <Th>{t("customers.expires")}</Th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-neutral-100 last:border-0">
                  <Td className="font-semibold">{sale.invoiceNumber}</Td>
                  <Td>
                    <p>{localizedName(sale.product)}</p>
                    <p className="text-xs text-neutral-500">{sale.product.sku}</p>
                  </Td>
                  <Td>{formatDate(sale.saleDate)}</Td>
                  <Td>{formatMoney(sale.pricePaid)}</Td>
                  <Td>
                    <WarrantyBadge status={sale.warrantyStatus} />
                  </Td>
                  <Td>{formatDate(sale.warrantyExpiry)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-extrabold">{t("customers.history")}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t("customers.historyHint")}</p>
        {requests.length === 0 ? (
          <EmptyState title={t("customers.noJobs")} body={t("customers.noJobsBody")} />
        ) : (
          <SurfaceTable>
            <thead>
              <tr className="border-b border-neutral-100">
                <Th>{t("common.requestId")}</Th>
                <Th>{t("common.opened")}</Th>
                <Th>{t("common.completed")}</Th>
                <Th>{t("common.type")}</Th>
                <Th>{t("common.product")}</Th>
                <Th>{t("customers.outcome")}</Th>
                <Th>{t("common.warranty")}</Th>
                <Th>{t("common.total")}</Th>
                <Th>{t("common.technician")}</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-neutral-100 last:border-0">
                  <Td className="font-mono text-xs font-semibold">
                    <Link to={`/app/requests/${request.id}`} className="text-[#B439FD] hover:underline">
                      {formatRequestId(request.displayId)}
                    </Link>
                  </Td>
                  <Td>{formatDateTime(request.createdAt)}</Td>
                  <Td>{request.completedAt ? formatDateTime(request.completedAt) : t("common.dash")}</Td>
                  <Td>
                    <TypeBadge type={request.type} />
                  </Td>
                  <Td>
                    <Link to={`/app/requests/${request.id}`} className="font-medium text-[#B439FD] hover:underline">
                      {localizedName(request.product)}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-sm font-semibold">{outcomeLabel(request.status, request.completedAt)}</span>
                  </Td>
                  <Td>
                    <WarrantyBadge status={request.warrantyStatus} />
                  </Td>
                  <Td className="font-semibold">
                    {formatMoney(request.finalCost ?? 0)}
                  </Td>
                  <Td>{request.assignedTechnician?.name ?? t("common.unassigned")}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        )}
      </section>

      <CustomerFormModal
        open={editOpen}
        customer={customer}
        pending={save.isPending}
        error={formError}
        onClose={() => setEditOpen(false)}
        onSubmit={async (values) => {
          await save.mutateAsync(values);
        }}
      />
      <SaleFormModal
        open={saleOpen}
        sale={null}
        defaultCustomerId={customer.id}
        pending={createSale.isPending}
        error={saleError}
        onClose={() => setSaleOpen(false)}
        onSubmit={async (values) => {
          await createSale.mutateAsync(values);
        }}
      />
    </div>
  );
}
