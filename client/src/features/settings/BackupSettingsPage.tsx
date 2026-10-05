import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Field, inputClass } from "../../components/Field";
import { InfoTip } from "../../components/InfoTip";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import type { AppSettings } from "../../lib/types";

function RulesForm() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["staff", "settings"],
    enabled: Boolean(token),
    queryFn: () => api<{ settings: AppSettings }>("/api/staff/settings", { token }),
  });
  const [form, setForm] = useState({ repairLegalDays: "20", repairWarrantyDays: "30", estimateValidDays: "7", pickupStorageDays: "14", requireEstimate: true, blockZeroStock: true });
  useEffect(() => {
    const value = settings.data?.settings;
    if (!value) return;
    setForm({
      repairLegalDays: String(value.repairLegalDays),
      repairWarrantyDays: String(value.repairWarrantyDays),
      estimateValidDays: String(value.estimateValidDays),
      pickupStorageDays: String(value.pickupStorageDays),
      requireEstimate: value.requireEstimate,
      blockZeroStock: value.blockZeroStock,
    });
  }, [settings.data]);
  const save = useMutation({
    mutationFn: () =>
      api("/api/staff/settings", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          repairLegalDays: Number(form.repairLegalDays),
          repairWarrantyDays: Number(form.repairWarrantyDays),
          estimateValidDays: Number(form.estimateValidDays),
          pickupStorageDays: Number(form.pickupStorageDays),
          requireEstimate: form.requireEstimate,
          blockZeroStock: form.blockZeroStock,
        }),
      }),
    onSuccess: async () => {
      notify(t("catalog.settingsSaved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "settings"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const numberField = (key: "repairLegalDays" | "repairWarrantyDays" | "estimateValidDays" | "pickupStorageDays", label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <input className={inputClass} type="number" min={0} max={365} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
    </Field>
  );
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
      className="rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <h2 className="text-sm font-extrabold">{t("settings.rulesTitle")}</h2>
      <p className="mt-2 text-sm text-neutral-600">{t("settings.rulesBody")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {numberField("repairLegalDays", t("settings.legalDays"), t("settings.legalDaysHint"))}
        {numberField("repairWarrantyDays", t("settings.repairWarrantyDays"), t("settings.repairWarrantyDaysHint"))}
        {numberField("estimateValidDays", t("settings.estimateDays"), t("settings.estimateDaysHint"))}
        {numberField("pickupStorageDays", t("settings.storageDays"), t("settings.storageDaysHint"))}
      </div>
      <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          {t("settings.requireEstimate")}
          <InfoTip text={t("settings.requireEstimateTip")} />
        </span>
        <input type="checkbox" checked={form.requireEstimate} onChange={(event) => setForm({ ...form, requireEstimate: event.target.checked })} />
      </label>
      <label className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          {t("catalog.blockZeroStock")}
          <InfoTip text={t("catalog.blockZeroStockTip")} />
        </span>
        <input type="checkbox" checked={form.blockZeroStock} onChange={(event) => setForm({ ...form, blockZeroStock: event.target.checked })} />
      </label>
      <button type="submit" disabled={save.isPending} className="mt-4 inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
        {save.isPending ? <Spinner className="h-4 w-4" /> : null}
        {t("common.save")}
      </button>
    </form>
  );
}

export function BackupSettingsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("settings.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-neutral-500">{t("settings.intro")}</p>

      <RulesForm />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link to="/app/staff" className="rounded-2xl border border-neutral-200 bg-white p-5 hover:shadow-[0_8px_30px_rgba(180,57,253,0.12)]">
          <h2 className="text-sm font-extrabold">{t("nav.staff")}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t("settings.staffBody")}</p>
        </Link>
        <Link to="/app/centers" className="rounded-2xl border border-neutral-200 bg-white p-5 hover:shadow-[0_8px_30px_rgba(180,57,253,0.12)]">
          <h2 className="text-sm font-extrabold">{t("nav.centers")}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t("settings.centersBody")}</p>
        </Link>
      </div>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.backupTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.backupBody")}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-600">
          <li>{t("settings.backupEnv")}</li>
          <li>{t("settings.backupManual")}</li>
          <li>{t("settings.backupRetain")}</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.restoreTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.restoreBody")}</p>
      </section>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.stockTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.stockBody")}</p>
        <Link to="/app/catalog" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#F5EBFD] px-4 text-sm font-bold text-[#7B00E0]">
          {t("settings.openCatalog")}
        </Link>
      </section>
    </div>
  );
}
