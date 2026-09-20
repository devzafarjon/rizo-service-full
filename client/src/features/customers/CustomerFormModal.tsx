import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { FALLBACK_REGION_CODE, UZBEKISTAN_REGIONS, regionLabel } from "../../lib/regions";
import type { StaffCustomer } from "../../lib/types";

export type CustomerFormValues = {
  name: string;
  phone: string;
  address?: string;
  regionCode?: string;
  notes?: string;
  password?: string;
};

export function CustomerFormModal({
  open,
  customer,
  existing,
  pending,
  error,
  onClose,
  onUseExisting,
  onSubmit,
}: {
  open: boolean;
  customer: StaffCustomer | null;
  existing?: StaffCustomer | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onUseExisting?: (customer: StaffCustomer) => void;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [regionCode, setRegionCode] = useState(FALLBACK_REGION_CODE);
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setAddress(customer?.address ?? "");
    setRegionCode(customer?.regionCode ?? FALLBACK_REGION_CODE);
    setNotes(customer?.notes ?? "");
    setPassword("");
  }, [open, customer]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      name,
      phone,
      address: address || undefined,
      regionCode,
      notes: notes || undefined,
      password: password || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={customer ? t("customers.edit") : t("customers.new")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t("auth.fullName")}>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label={t("common.phone")}>
          <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} required />
        </Field>
        <Field label={t("common.address")}>
          <input className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} />
        </Field>
        <Field label={t("customers.region")} hint={t("customers.regionHint")} tooltip={t("customers.regionTip")}>
          <select className={inputClass} value={regionCode} onChange={(event) => setRegionCode(event.target.value)}>
            <option value={FALLBACK_REGION_CODE}>{t("regions.unknownOption")}</option>
            {UZBEKISTAN_REGIONS.map((region) => (
              <option key={region.code} value={region.code}>
                {regionLabel(region.code)} ({region.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("customers.internalNotes")}>
          <textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Field
          label={customer ? t("customers.newPortalPassword") : t("customers.portalPassword")}
          hint={customer ? t("customers.passwordKeepHint") : t("customers.passwordGenerateHint")}
        >
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {existing ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-900">{t("customers.existingHint", { name: existing.name, phone: existing.phone })}</p>
            {onUseExisting ? (
              <button
                type="button"
                onClick={() => onUseExisting(existing)}
                className="mt-2 text-sm font-bold text-[#B439FD]"
              >
                {t("customers.useExisting")}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF] disabled:opacity-70"
          >
            {pending ? <Spinner className="h-4 w-4" /> : null}
            {customer ? t("common.save") : t("customers.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
