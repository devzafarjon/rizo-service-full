import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { localizedName } from "../../lib/localized";
import type { DefectCodeOption, PaymentMethod, RequestDecision, ServiceRequest } from "../../lib/types";

const OPTIONS: RequestDecision[] = ["warranty_repair", "paid_repair", "replace", "refund", "reject"];
const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "payme", "click", "other"];

export type DecisionPayload = {
  decision: RequestDecision;
  note?: string;
  rejectionReason?: string;
  refundAmount?: number;
  refundMethod?: PaymentMethod;
  returnReasonId?: string;
  override?: boolean;
  replacement?: { productId: string; serialNumber: string };
};

/** The decision on a repair: warranty repair, paid repair (needs an estimate), replacement, refund or rejection with a reason. */
export function DecisionPanel({
  request,
  returnReasons,
  busy,
  onSubmit,
}: {
  request: ServiceRequest;
  returnReasons: DefectCodeOption[];
  busy: boolean;
  onSubmit: (payload: DecisionPayload) => void;
}) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<RequestDecision>(request.warrantyStatus === "in_warranty" ? "warranty_repair" : "paid_repair");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [serial, setSerial] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [returnReasonId, setReturnReasonId] = useState("");

  const expired = request.warrantyStatus !== "in_warranty";
  const valid =
    decision === "reject" ? reason.trim().length > 0 : decision === "warranty_repair" ? !expired || override : decision === "refund" ? true : true;

  function submit() {
    const payload: DecisionPayload = { decision, note: note.trim() || undefined };
    if (decision === "warranty_repair") payload.override = override;
    if (decision === "reject") payload.rejectionReason = reason.trim();
    if (decision === "replace" && serial.trim()) payload.replacement = { productId: request.productId, serialNumber: serial.trim() };
    if (decision === "refund") {
      payload.refundAmount = Number(amount) || undefined;
      payload.refundMethod = method;
      payload.returnReasonId = returnReasonId || undefined;
    }
    onSubmit(payload);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={decision === option}
            onClick={() => setDecision(option)}
            className={`rounded-2xl border px-3 py-3 text-left ${decision === option ? "border-[#7B00E0] bg-[#F5EBFD]" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
          >
            <p className="text-sm font-bold">{t(`decision.${option}`)}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{t(`decision.${option}Hint`)}</p>
          </button>
        ))}
      </div>

      {decision === "warranty_repair" && expired ? (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          <input type="checkbox" className="mt-1" checked={override} onChange={(event) => setOverride(event.target.checked)} />
          <span>
            {t("decision.goodwill")}
            <span className="block text-xs font-normal">{t("decision.goodwillHint")}</span>
          </span>
        </label>
      ) : null}
      {decision === "paid_repair" ? <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{t("decision.paidNext")}</p> : null}
      {decision === "replace" ? (
        <Field label={t("decision.newSerial")} hint={t("decision.newSerialHint")}>
          <input className={inputClass} value={serial} onChange={(event) => setSerial(event.target.value)} />
        </Field>
      ) : null}
      {decision === "refund" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("decision.refundAmount")}>
            <input className={inputClass} type="number" min={0} step={1000} value={amount} onChange={(event) => setAmount(event.target.value)} />
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
          <Field label={t("decision.returnReason")}>
            <select className={`${inputClass} bg-white`} value={returnReasonId} onChange={(event) => setReturnReasonId(event.target.value)}>
              <option value="">{t("common.dash")}</option>
              {returnReasons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {localizedName(item)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
      {decision === "reject" ? (
        <Field label={t("decision.rejectReason")} hint={t("decision.rejectReasonHint")}>
          <textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </Field>
      ) : null}
      <Field label={t("decision.note")}>
        <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </Field>
      <button
        type="button"
        disabled={busy || !valid}
        onClick={submit}
        className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-[12.8px] font-bold text-white disabled:opacity-50 ${decision === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-[#7B00E0] hover:bg-[#6500BD]"}`}
      >
        {busy ? <Spinner className="h-4 w-4" /> : null}
        {t("decision.apply")}
      </button>
    </div>
  );
}
