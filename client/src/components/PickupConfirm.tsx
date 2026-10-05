import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";
import { SignaturePad } from "./SignaturePad";
import { segmentedGroupClass, segmentedItemClass } from "./segmented";

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
      <div className={`${segmentedGroupClass} mt-3`}>
        <button
          type="button"
          onClick={() => setMode("tap")}
          className={segmentedItemClass(mode === "tap")}
        >
          {t("pickup.tap")}
        </button>
        <button
          type="button"
          onClick={() => setMode("sign")}
          className={segmentedItemClass(mode === "sign")}
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
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD] disabled:opacity-60"
      >
        {pending ? <Spinner className="h-4 w-4" /> : null}
        {t("pickup.confirm")}
      </button>
    </div>
  );
}
