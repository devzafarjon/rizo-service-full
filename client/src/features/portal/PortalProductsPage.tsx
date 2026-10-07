import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { PortalSale, WarrantyPlan } from "../../lib/types";

/** The customer's products: warranty countdown, a way to book service, and paid warranty extensions. */
export function PortalProductsPage() {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [planFor, setPlanFor] = useState<PortalSale | null>(null);

  const sales = useQuery({
    queryKey: ["customer", "sales"],
    enabled: Boolean(token),
    queryFn: () => api<{ sales: PortalSale[] }>("/api/customer/sales", { token }),
  });
  const plans = useQuery({
    queryKey: ["customer", "plans", planFor?.id],
    enabled: Boolean(token && planFor),
    queryFn: () => api<{ plans: WarrantyPlan[]; requestedPlanId: string | null }>(`/api/customer/warranty-plans?saleId=${planFor!.id}`, { token }),
  });
  const request = useMutation({
    mutationFn: (planId: string) => api(`/api/customer/sales/${planFor!.id}/warranty-plan`, { method: "POST", token, body: JSON.stringify({ planId }) }),
    onSuccess: async () => {
      setPlanFor(null);
      notify(t("plans.requested"));
      await queryClient.invalidateQueries({ queryKey: ["customer"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (sales.isLoading) return <PageSkeleton />;
  const rows = (sales.data?.sales ?? []).filter((row) => !row.voided);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("products.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("products.intro")}</p>
        </div>
        <Link to="/portal/register" className="btn-rizo-ghost shrink-0">
          <PackagePlus size={16} />
          {t("nav.registerProduct")}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState title={t("products.emptyTitle")} body={t("products.emptyBody")} />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((sale) => {
            const left = sale.warrantyDaysLeft;
            return (
              <li key={sale.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold text-neutral-900">{localizedName(sale.product)}</h2>
                    <p className="text-xs text-neutral-500">
                      {sale.product.sku} · {sale.invoiceNumber}
                      {sale.serialNumber ? ` · ${t("serial.label")}: ${sale.serialNumber}` : ""}
                    </p>
                  </div>
                  <WarrantyBadge status={sale.warrantyStatus} />
                </div>
                <p className="mt-3 text-sm text-neutral-700">
                  {sale.warrantyStatus === "in_warranty" ? t("products.warrantyUntil", { date: formatDate(sale.warrantyExpiry) }) : t("products.warrantyEnded", { date: formatDate(sale.warrantyExpiry) })}
                  {left != null && left >= 0 && left <= 60 ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">{t("products.daysLeft", { count: left })}</span> : null}
                </p>
                {sale.isVerified === false ? <p className="mt-1 text-xs text-neutral-500">{t("products.unverified")}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/portal/new?saleId=${sale.id}`} className="btn-rizo h-11">
                    {t("products.bookService")}
                  </Link>
                  <button type="button" className="btn-rizo-ghost h-11" onClick={() => setPlanFor(sale)}>
                    <ShieldCheck size={16} />
                    {t("products.extend")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={Boolean(planFor)} onClose={() => setPlanFor(null)} title={t("products.extendTitle")}>
        {plans.isLoading ? (
          <p className="text-sm text-neutral-500">{t("common.loading")}</p>
        ) : (plans.data?.plans ?? []).length === 0 ? (
          <p className="text-sm text-neutral-600">{t("products.noPlans")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">{t("products.extendBody")}</p>
            {(plans.data?.plans ?? []).map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                <div>
                  <p className="font-bold">{localizedName(plan)}</p>
                  <p className="text-sm text-neutral-500">{formatMoney(plan.price)}</p>
                </div>
                <button type="button" className="btn-rizo h-10" disabled={request.isPending || plans.data?.requestedPlanId != null} onClick={() => request.mutate(plan.id)}>
                  {request.isPending ? <Spinner className="h-4 w-4" /> : null}
                  {plans.data?.requestedPlanId === plan.id ? t("products.asked") : t("products.ask")}
                </button>
              </div>
            ))}
            <p className="text-xs text-neutral-500">{t("products.payAtService")}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
