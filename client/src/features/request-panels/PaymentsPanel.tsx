import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { formatMoney, formatStamp } from "../../lib/format";
import type { PaymentMethod, PaymentRow } from "../../lib/types";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "payme", "click", "other"];

export type PaymentPayload = { amount: number; method: PaymentMethod; kind: "payment" | "refund"; note?: string; fiscalReceiptNumber?: string };

/** What the customer owes, what was paid and refunded, and a form to record cash, card or transfer payments. */
export function PaymentsPanel({
  summary,
  payments,
  requireFiscal,
  busy,
  onSubmit,
}: {
  summary: { due: number; paid: number; refunded: number; net: number; balance: number };
  payments: PaymentRow[];
  fiscalReceiptNumber?: string | null;
  /** The admins switched on "every payment needs a fiscal receipt number". */
  requireFiscal?: boolean;
  busy: boolean;
  onSubmit: (payload: PaymentPayload) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [kind, setKind] = useState<"payment" | "refund">("payment");
  // The receipt number belongs to one payment, so the field starts empty each time.
  const [fiscal, setFiscal] = useState("");
  const [note, setNote] = useState("");

  const value = Number(amount);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [t("payments.due"), summary.due, "text-neutral-900"],
          [t("payments.paid"), summary.paid, "text-emerald-700"],
          [t("payments.refunded"), summary.refunded, "text-neutral-700"],
          [t("payments.balance"), summary.balance, summary.balance > 0 ? "text-red-700" : "text-emerald-700"],
        ].map(([label, amountValue, tone]) => (
          <div key={String(label)} className="rounded-xl bg-neutral-50 px-3 py-2">
            <dt className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase">{label}</dt>
            <dd className={`text-base font-extrabold tabular-nums ${tone}`}>{formatMoney(Number(amountValue))}</dd>
          </div>
        ))}
      </dl>
      {payments.length > 0 ? (
        <ul className="divide-y divide-neutral-100 text-sm">
          {payments.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-semibold">{row.kind === "refund" ? t("payments.refund") : t("payments.payment")}</span> · {t(`payments.methods.${row.method}`)}
                <span className="block text-xs text-neutral-500">
                  {formatStamp(row.createdAt)}
                  {row.createdByName ? ` · ${row.createdByName}` : ""}
                  {row.note ? ` · ${row.note}` : ""}
                  {row.fiscalReceiptNumber ? ` · ${t("payments.fiscalShort")} ${row.fiscalReceiptNumber}` : row.kind === "payment" ? ` · ${t("payments.noFiscal")}` : ""}
                </span>
              </span>
              <span className={`shrink-0 font-bold tabular-nums ${row.kind === "refund" ? "text-red-700" : "text-emerald-700"}`}>
                {row.kind === "refund" ? "−" : "+"}
                {formatMoney(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">{t("payments.none")}</p>
      )}
      <form
        className="grid gap-3 rounded-2xl border border-neutral-200 p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!(value > 0)) return;
          if (requireFiscal && kind === "payment" && !fiscal.trim()) return;
          onSubmit({ amount: value, method, kind, note: note.trim() || undefined, fiscalReceiptNumber: fiscal.trim() || undefined });
          setAmount("");
          setNote("");
          setFiscal("");
        }}
      >
        <Field label={t("payments.amount")}>
          <input className={inputClass} type="number" min={1} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={summary.balance > 0 ? String(summary.balance) : ""} />
        </Field>
        <Field label={t("payments.method")}>
          <select className={`${inputClass} bg-white`} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {METHODS.map((item) => (
              <option key={item} value={item}>
                {t(`payments.methods.${item}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("payments.fiscal")} hint={requireFiscal ? t("payments.fiscalRequired") : t("payments.fiscalHint")}>
          <input className={inputClass} value={fiscal} required={Boolean(requireFiscal) && kind === "payment"} onChange={(event) => setFiscal(event.target.value)} />
        </Field>
        <Field label={t("payments.note")}>
          <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <div className="inline-flex rounded-lg bg-neutral-100 p-1">
            {(["payment", "refund"] as const).map((item) => (
              <button key={item} type="button" onClick={() => setKind(item)} className={`h-9 rounded-md px-4 text-sm font-bold ${kind === item ? "bg-white shadow-sm" : "text-neutral-600"}`}>
                {t(`payments.${item}`)}
              </button>
            ))}
          </div>
          {summary.balance > 0 && kind === "payment" ? (
            <button type="button" onClick={() => setAmount(String(summary.balance))} className="h-9 rounded-md bg-neutral-100 px-3 text-sm font-bold">
              {t("payments.fillBalance")}
            </button>
          ) : null}
          <button type="submit" disabled={busy || !(value > 0)} className="ml-auto inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD] disabled:opacity-50">
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {kind === "refund" ? t("payments.recordRefund") : t("payments.record")}
          </button>
        </div>
      </form>
    </div>
  );
}
