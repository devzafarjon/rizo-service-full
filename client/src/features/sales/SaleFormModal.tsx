import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { WarrantyBadge } from "../../components/Badges";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatPhone } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Product, Sale, StaffCustomer } from "../../lib/types";
import { addMonths, todayIso, warrantyStatusFor } from "../../lib/warranty";

export function SaleFormModal({
  open,
  sale,
  defaultCustomerId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  sale: Sale | null;
  defaultCustomerId?: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: {
    customerId: string;
    productId: string;
    quantity: number;
    saleDate: string;
    pricePaid: number;
    warrantyMonths: number;
    invoiceNumber?: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saleDate, setSaleDate] = useState(todayIso());
  const [pricePaid, setPricePaid] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("12");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const customersQuery = useQuery({
    queryKey: ["staff", "customers"],
    enabled: open && Boolean(token),
    queryFn: () => api<{ customers: StaffCustomer[] }>("/api/staff/customers", { token }),
  });
  const productsQuery = useQuery({
    queryKey: ["staff", "products"],
    enabled: open && Boolean(token),
    queryFn: () => api<{ products: Product[] }>("/api/staff/products", { token }),
  });

  useEffect(() => {
    if (!open) return;
    setCustomerId(sale?.customerId ?? defaultCustomerId ?? "");
    setProductId(sale?.productId ?? "");
    setQuantity(String(sale?.quantity ?? 1));
    setSaleDate(sale?.saleDate ?? todayIso());
    setPricePaid(sale ? String(sale.pricePaid) : "");
    setWarrantyMonths(String(sale?.warrantyMonths ?? 12));
    setInvoiceNumber(sale?.invoiceNumber ?? "");
  }, [open, sale, defaultCustomerId]);

  const months = Number(warrantyMonths) || 0;
  const expiry = useMemo(() => addMonths(saleDate || todayIso(), months), [saleDate, months]);
  const previewStatus = warrantyStatusFor(saleDate || todayIso(), months, expiry);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      customerId,
      productId,
      quantity: Number(quantity),
      saleDate,
      pricePaid: Number(pricePaid),
      warrantyMonths: months,
      invoiceNumber: invoiceNumber || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={sale ? t("sales.editTitle", { invoice: sale.invoiceNumber }) : t("sales.new")} wide>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.customer")}>
          <select className={inputClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">{t("newRequest.selectCustomer")}</option>
            {(customersQuery.data?.customers ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {formatPhone(customer.phone)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("common.product")}>
          <select className={inputClass} value={productId} onChange={(event) => setProductId(event.target.value)} required>
            <option value="">{t("newRequest.selectProduct")}</option>
            {(productsQuery.data?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {localizedName(product)} ({product.sku})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("sales.quantity")}>
          <input className={inputClass} type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </Field>
        <Field label={t("sales.saleDate")}>
          <input className={inputClass} type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} required />
        </Field>
        <Field label={`${t("sales.pricePaid")} (${t("common.som")})`}>
          <input className={inputClass} type="number" min={0} step={1000} value={pricePaid} onChange={(event) => setPricePaid(event.target.value)} required />
        </Field>
        <Field label={t("sales.warrantyMonths")}>
          <input className={inputClass} type="number" min={0} max={120} value={warrantyMonths} onChange={(event) => setWarrantyMonths(event.target.value)} required />
        </Field>
        <Field label={t("sales.invoiceNumber")} hint={sale ? undefined : t("sales.invoiceHint")}>
          <input className={inputClass} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
        </Field>
        <div className="rounded-xl bg-[#FAFAFA] p-3 sm:col-span-1">
          <p className="text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("sales.warrantyExpiry")}</p>
          <p className="mt-1 text-sm font-semibold">{formatDate(expiry)}</p>
          <div className="mt-2">
            <WarrantyBadge status={previewStatus} />
          </div>
        </div>
        {error ? <p className="text-sm font-medium text-red-600 sm:col-span-2">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF] disabled:opacity-70"
          >
            {pending ? <Spinner className="h-4 w-4" /> : null}
            {sale ? t("sales.save") : t("sales.record")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
