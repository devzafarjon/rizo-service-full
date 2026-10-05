import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass, textareaClass } from "./Field";
import { Modal } from "./Modal";

const PAUSE_PRESETS = [1, 4, 8, 24];

/** Asks for the mandatory pause reason and the timer length (hours). */
export function PauseDialog({
  name,
  busy,
  onClose,
  onSubmit,
}: {
  /** Customer name shown in the hint; null keeps the dialog closed. */
  name: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (hours: number, reason: string) => void;
}) {
  const { t } = useTranslation();
  const [hours, setHours] = useState("4");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (name != null) {
      setHours("4");
      setReason("");
    }
  }, [name]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(hours);
    const trimmed = reason.trim();
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    if (!trimmed) return;
    onSubmit(parsed, trimmed);
  }

  return (
    <Modal open={name != null} onClose={onClose} title={t("tech.pauseTitle")}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-neutral-500">
          {name != null ? t("tech.pauseHint", { name }) : null}
        </p>
        <Field label={t("tech.pauseHours")} hint={t("tech.pauseHoursHint")}>
          <input
            className={inputClass}
            type="number"
            min={0.25}
            step={0.25}
            max={336}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {PAUSE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setHours(String(preset))}
              className={`h-10 rounded-full px-3 text-sm font-bold ${
                hours === String(preset) ? "bg-[#7B00E0] text-white" : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {t("tech.hoursShort", { count: preset })}
            </button>
          ))}
        </div>
        <Field label={t("tech.pauseReason")} hint={t("tech.pauseReasonHint")}>
          <textarea
            className={textareaClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("tech.pauseReasonPlaceholder")}
            required
          />
        </Field>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !reason.trim() || Number(hours) <= 0}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#7B00E0] text-sm font-extrabold text-white disabled:opacity-50"
          >
            {t("tech.pauseSubmit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
