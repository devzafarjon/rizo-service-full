import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";
import { SignaturePad } from "./SignaturePad";

export function PickupConfirm({
  pending,
  onConfirm,
}: {
  pending: boolean;
  onConfirm: (signature: string | null) => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const [signature, setSignature] = useState<string | null>(null);
  const [mode, setMode] = useState<"tap" | "sign">("tap");

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("pickup.title")}</h2>
      <p className="mt-1 text-sm text-neutral-600">{t("pickup.hint")}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("tap")}
          className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "tap" ? "bg-[#B439FD] text-white" : "bg-neutral-100 text-neutral-600"}`}
        >
          {t("pickup.tap")}
        </button>
        <button
          type="button"
          onClick={() => setMode("sign")}
          className={`h-10 rounded-full px-4 text-sm font-bold ${mode === "sign" ? "bg-[#B439FD] text-white" : "bg-neutral-100 text-neutral-600"}`}
        >
          {t("pickup.sign")}
        </button>
      </div>
      {mode === "sign" ? (
        <div className="mt-4">
          <SignaturePad value={signature} onChange={setSignature} disabled={pending} />
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending || (mode === "sign" && !signature)}
        onClick={() => onConfirm(mode === "sign" ? signature : null)}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF] disabled:opacity-60"
      >
        {pending ? <Spinner className="h-4 w-4" /> : null}
        {t("pickup.confirm")}
      </button>
    </div>
  );
}
