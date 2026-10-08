import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney, formatStamp } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { PaymentMethod, Sale, WarrantyPlan, WarrantyPurchase } from "../../lib/types";
import { segmentedGroupClass, segmentedItemClass } from "../../components/segmented";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "payme", "click", "other"];
const TABS = ["requested", "paid", "plans"] as const;

type PlanDraft = { id: string | null; nameUz: string; nameRu: string; nameEn: string; months: string; price: string; productCategories: string[]; isActive: boolean };
type PayDraft = { purchaseId: string | null; saleId: string | null; planId: string; method: PaymentMethod; fiscalReceiptNumber: string };

/** Paid warranty extensions: what customers asked for, what was bought, and the plans on offer. */
export function WarrantyPlansPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const canAct = isAdmin || user?.role === "receptionist";
  const [tab, setTab] = useState<(typeof TABS)[number]>("requested");
  const [plan, setPlan] = useState<PlanDraft | null>(null);
  const [pay, setPay] = useState<PayDraft | null>(null);
  const [saleQuery, setSaleQuery] = useState("");
  const search = useDebouncedValue(saleQuery, 250);

  const plans = useQuery({
    queryKey: ["staff", "warranty-plans"],
    enabled: Boolean(token),
    queryFn: () => api<{ plans: WarrantyPlan[] }>("/api/staff/warranty-plans", { token }),
  });
  const purchases = useQuery({
    queryKey: ["staff", "warranty-purchases"],
    enabled: Boolean(token),
    queryFn: () => api<{ purchases: WarrantyPurchase[] }>("/api/staff/warranty-plans/purchases", { token }),
  });
  const categories = useQuery({
    queryKey: ["staff", "categories"],
    enabled: Boolean(token && isAdmin),
    queryFn: () => api<{ categories: string[] }>("/api/staff/catalog/categories", { token }),
  });
  const sales = useQuery({
    queryKey: ["staff", "sales", "plan-search", search],
    enabled: Boolean(token && pay && !pay.purchaseId && search.length >= 2),
    queryFn: () => api<{ sales: Sale[] }>(`/api/staff/sales?q=${encodeURIComponent(search)}`, { token }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff", "warranty-plans"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "warranty-purchases"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "sales"] });
  };
  const savePlan = useMutation({
    mutationFn: (value: PlanDraft) => {
      const body = { nameUz: value.nameUz, nameRu: value.nameRu, nameEn: value.nameEn, name: value.nameEn || value.nameUz || value.nameRu, months: Number(value.months), price: Number(value.price), productCategories: value.productCategories, isActive: value.isActive };
      return value.id ? api(`/api/staff/warranty-plans/${value.id}`, { method: "PATCH", token, body: JSON.stringify(body) }) : api("/api/staff/warranty-plans", { method: "POST", token, body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      setPlan(null);
      notify(t("plans.saved"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const submitPay = useMutation({
    mutationFn: (value: PayDraft) =>
      value.purchaseId
        ? api(`/api/staff/warranty-plans/purchases/${value.purchaseId}/pay`, { method: "POST", token, body: JSON.stringify({ method: value.method, fiscalReceiptNumber: value.fiscalReceiptNumber || null }) })
        : api("/api/staff/warranty-plans/sell", { method: "POST", token, body: JSON.stringify({ saleId: value.saleId, planId: value.planId, method: value.method, fiscalReceiptNumber: value.fiscalReceiptNumber || null }) }),
    onSuccess: async () => {
      setPay(null);
      notify(t("plans.paidDone"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/staff/warranty-plans/purchases/${id}/cancel`, { method: "POST", token }),
    onSuccess: refresh,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (plans.isLoading || purchases.isLoading) return <PageSkeleton />;
  const all = purchases.data?.purchases ?? [];
  const rows = all.filter((row) => (tab === "requested" ? row.status === "requested" : tab === "paid" ? row.status !== "requested" : false));

  function submitPayForm(event: FormEvent) {
    event.preventDefault();
    if (pay) submitPay.mutate(pay);
  }
  const chosenSale = (sales.data?.sales ?? []).find((row) => row.id === pay?.saleId);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("plans.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("plans.intro")}</p>
        </div>
        <div className="flex gap-2">
          {canAct ? (
            <button type="button" className="btn-rizo-ghost" onClick={() => setPay({ purchaseId: null, saleId: null, planId: "", method: "cash", fiscalReceiptNumber: "" })}>
              {t("plans.sell")}
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" className="btn-rizo" onClick={() => setPlan({ id: null, nameUz: "", nameRu: "", nameEn: "", months: "12", price: "", productCategories: [], isActive: true })}>
              <Plus size={16} />
              {t("plans.newPlan")}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${segmentedGroupClass} mb-3`}>
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={segmentedItemClass(tab === item)}>
            {t(`plans.tab.${item}`)}
            {item === "requested" && all.some((row) => row.status === "requested") ? <span className="ml-2 rounded-full bg-[#7B00E0] px-2 py-0.5 text-[10px] text-white">{all.filter((row) => row.status === "requested").length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "plans" ? (
        (plans.data?.plans ?? []).length === 0 ? (
          <EmptyState title={t("plans.noPlans")} body={t("plans.noPlansBody")} />
        ) : (
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("plans.planName")}</Th>
                <Th>{t("plans.months")}</Th>
                <Th>{t("plans.price")}</Th>
                <Th>{t("plans.categories")}</Th>
                <Th>{t("common.status")}</Th>
                {isAdmin ? <Th className="text-right">{t("common.actions")}</Th> : null}
              </tr>
            </thead>
            <tbody>
              {(plans.data?.plans ?? []).map((row) => (
                <tr key={row.id}>
                  <Td className="font-semibold">{localizedName(row)}</Td>
                  <Td>+{row.months}</Td>
                  <Td>{formatMoney(row.price)}</Td>
                  <Td className="max-w-xs truncate">{row.productCategories.map((name) => categoryLabel(name)).join(", ")}</Td>
                  <Td>{row.isActive ? t("plans.active") : t("plans.off")}</Td>
                  {isAdmin ? (
                    <Td className="text-right">
                      <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => setPlan({ id: row.id, nameUz: row.nameUz ?? row.name, nameRu: row.nameRu ?? row.name, nameEn: row.nameEn ?? row.name, months: String(row.months), price: String(row.price), productCategories: row.productCategories, isActive: row.isActive })}>
                        {t("common.edit")}
                      </button>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        )
      ) : rows.length === 0 ? (
        <EmptyState title={t(`plans.empty.${tab}`)} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("common.date")}</Th>
              <Th>{t("common.customer")}</Th>
              <Th>{t("common.product")}</Th>
              <Th>{t("plans.planName")}</Th>
              <Th>{t("plans.price")}</Th>
              <Th>{t("plans.warrantyUntil")}</Th>
              <Th>{t("common.status")}</Th>
              {canAct && tab === "requested" ? <Th className="text-right">{t("common.actions")}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>{formatStamp(row.paidAt ?? row.requestedAt)}</Td>
                <Td className="font-semibold">{row.customer.name}</Td>
                <Td>{localizedName(row.sale.product)}</Td>
                <Td>+{row.months}</Td>
                <Td>{formatMoney(row.price)}</Td>
                <Td>{formatDate(row.sale.warrantyExpiry)}</Td>
                <Td>{t(`plans.status.${row.status}`)}</Td>
                {canAct && tab === "requested" ? (
                  <Td className="text-right">
                    <button type="button" className="mr-3 text-sm font-bold text-[#7B00E0] hover:underline" onClick={() => setPay({ purchaseId: row.id, saleId: row.sale.id, planId: row.plan.id, method: "cash", fiscalReceiptNumber: "" })}>
                      {t("plans.takePayment")}
                    </button>
                    <button type="button" className="text-sm font-semibold text-red-600 hover:underline" onClick={() => cancel.mutate(row.id)}>
                      {t("common.cancel")}
                    </button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <Modal open={Boolean(plan)} onClose={() => setPlan(null)} title={plan?.id ? t("plans.editPlan") : t("plans.newPlan")} wide>
        {plan ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              savePlan.mutate(plan);
            }}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(["Uz", "Ru", "En"] as const).map((code) => {
                const key = `name${code}` as "nameUz" | "nameRu" | "nameEn";
                return (
                  <Field key={code} label={`${t("plans.planName")} · ${t(`languages.${code.toLowerCase()}`)}`}>
                    <input className={inputClass} value={plan[key]} maxLength={120} onChange={(event) => setPlan({ ...plan, [key]: event.target.value })} />
                  </Field>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("plans.months")}>
                <input className={inputClass} type="number" min={1} max={60} value={plan.months} onChange={(event) => setPlan({ ...plan, months: event.target.value })} required />
              </Field>
              <Field label={t("plans.price")}>
                <input className={inputClass} type="number" min={0} value={plan.price} onChange={(event) => setPlan({ ...plan, price: event.target.value })} required />
              </Field>
            </div>
            <Field label={t("plans.categories")}>
              <div className="flex flex-wrap gap-2">
                {(categories.data?.categories ?? []).map((name) => {
                  const on = plan.productCategories.includes(name);
                  return (
                    <button key={name} type="button" onClick={() => setPlan({ ...plan, productCategories: on ? plan.productCategories.filter((item) => item !== name) : [...plan.productCategories, name] })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-[#7B00E0] bg-[#F5EBFD] text-[#7B00E0]" : "border-neutral-300 text-neutral-600"}`}>
                      {categoryLabel(name)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={plan.isActive} onChange={(event) => setPlan({ ...plan, isActive: event.target.checked })} />
              {t("plans.active")}
            </label>
            <button type="submit" className="btn-rizo h-12 w-full" disabled={savePlan.isPending}>
              {savePlan.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("common.save")}
            </button>
          </form>
        ) : null}
      </Modal>

      <Modal open={Boolean(pay)} onClose={() => setPay(null)} title={pay?.purchaseId ? t("plans.takePayment") : t("plans.sell")}>
        {pay ? (
          <form onSubmit={submitPayForm} className="space-y-4">
            {!pay.purchaseId ? (
              <>
                <Field label={t("plans.findSale")}>
                  <input className={inputClass} value={saleQuery} onChange={(event) => setSaleQuery(event.target.value)} placeholder={t("plans.findSaleHint")} />
                </Field>
                {(sales.data?.sales ?? []).length > 0 ? (
                  <ul className="max-h-40 divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200 text-sm">
                    {(sales.data?.sales ?? []).slice(0, 8).map((row) => (
                      <li key={row.id}>
                        <button type="button" className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-neutral-50 ${pay.saleId === row.id ? "bg-[#F5EBFD]" : ""}`} onClick={() => setPay({ ...pay, saleId: row.id, planId: "" })}>
                          <span className="font-semibold">{row.invoiceNumber} · {localizedName(row.product)}</span>
                          <span className="text-xs text-neutral-500">{row.customer.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Field label={t("plans.planName")}>
                  <select className={inputClass} value={pay.planId} onChange={(event) => setPay({ ...pay, planId: event.target.value })} required>
                    <option value="">{t("common.select")}</option>
                    {(plans.data?.plans ?? [])
                      .filter((row) => row.isActive && (!chosenSale || row.productCategories.includes(chosenSale.product.category)))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {localizedName(row)} · {formatMoney(row.price)}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            ) : null}
            <Field label={t("payments.method")}>
              <select className={inputClass} value={pay.method} onChange={(event) => setPay({ ...pay, method: event.target.value as PaymentMethod })}>
                {METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`payments.methods.${method}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("payments.fiscal")}>
              <input className={inputClass} value={pay.fiscalReceiptNumber} maxLength={60} onChange={(event) => setPay({ ...pay, fiscalReceiptNumber: event.target.value })} />
            </Field>
            <button type="submit" className="btn-rizo h-12 w-full" disabled={submitPay.isPending || (!pay.purchaseId && (!pay.saleId || !pay.planId))}>
              {submitPay.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("plans.confirmPayment")}
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
