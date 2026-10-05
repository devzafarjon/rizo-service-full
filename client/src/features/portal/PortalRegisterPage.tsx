import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { todayIso } from "../../lib/warranty";
import { localizedName } from "../../lib/localized";
import type { Named } from "../../lib/types";
import { portalInputClass } from "./fields";

/** A customer registers a product bought elsewhere so warranty and service history work for it too. The office verifies it later. */
export function PortalRegisterPage() {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["customer", "products"],
    enabled: Boolean(token),
    queryFn: () => api<{ products: Array<Named & { id: string; sku: string; category: string }> }>("/api/customer/products", { token }),
  });
  const register = useMutation({
    mutationFn: () =>
      api("/api/customer/sales/register", {
        method: "POST",
        token,
        body: JSON.stringify({ productId, serialNumber, purchaseDate, invoiceNumber: invoiceNumber || null }),
      }),
    onSuccess: async () => {
      notify(t("register.saved"));
      await queryClient.invalidateQueries({ queryKey: ["customer"] });
      navigate("/portal/new");
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    register.mutate();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("register.title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("register.intro")}</p>
      <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <Field label={t("common.product")}>
          <select className={portalInputClass} required value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">{t("register.selectProduct")}</option>
            {(products.data?.products ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {localizedName(item)} · {item.sku}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("serial.label")} hint={t("register.serialHint")}>
          <input className={portalInputClass} required value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} maxLength={80} />
        </Field>
        <Field label={t("register.purchaseDate")}>
          <input className={portalInputClass} type="date" required max={todayIso()} value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
        </Field>
        <Field label={t("register.invoice")} hint={t("register.invoiceHint")}>
          <input className={portalInputClass} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} maxLength={60} />
        </Field>
        <p className="rounded-xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">{t("register.verifyNote")}</p>
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Link to="/portal" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold text-neutral-600">
            {t("common.cancel")}
          </Link>
          <button type="submit" disabled={register.isPending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50">
            {register.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("register.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
