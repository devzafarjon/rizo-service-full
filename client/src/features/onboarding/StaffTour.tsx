import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const STEPS = ["kanban", "new-request", "notifications", "reports", "management"] as const;

function tourKey(userId: string) {
  return `rizo_tour_done_${userId}`;
}

export function StaffTour({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(() => localStorage.getItem(tourKey(userId)) !== "1");

  useEffect(() => {
    if (!open) return;
    const id = STEPS[step];
    if (id === "reports" || id === "management") {
      window.dispatchEvent(new Event("rizo-expand-management"));
    }
  }, [open, step]);

  if (!open) return null;

  function finish() {
    localStorage.setItem(tourKey(userId), "1");
    setOpen(false);
  }

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[90] print:hidden">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label={t("tour.skip")} onClick={finish} />
      <div className="absolute inset-x-4 bottom-6 mx-auto max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:bottom-10">
        <p className="text-xs font-bold tracking-wide text-[#B439FD] uppercase">
          {t("common.stepOf", { current: step + 1, total: STEPS.length })}
        </p>
        <h2 className="mt-2 text-lg font-extrabold text-neutral-900">{t(`tour.${current}.title`)}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t(`tour.${current}.body`)}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={finish} className="min-h-11 px-3 text-sm font-semibold text-neutral-500">
            {t("tour.skip")}
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((currentStep) => currentStep - 1)}
                className="inline-flex min-h-11 items-center rounded-xl bg-neutral-100 px-4 text-sm font-bold"
              >
                {t("common.back")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (step >= STEPS.length - 1) {
                  finish();
                  return;
                }
                setStep((currentStep) => currentStep + 1);
              }}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-extrabold text-white"
            >
              {step >= STEPS.length - 1 ? t("common.done") : t("common.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
