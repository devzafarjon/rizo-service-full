import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "./StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import type { StaffUser } from "../../lib/types";

type Setup = { secret: string; otpauthUrl: string; qr: string };

/** Two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). */
export function SecurityPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const refreshMe = (next: StaffUser) => queryClient.setQueryData(["staff", "me", token], next);

  const start = useMutation({
    mutationFn: () => api<Setup>("/api/staff/auth/2fa/setup", { method: "POST", token }),
    onSuccess: (data) => {
      setSetup(data);
      setCode("");
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const enable = useMutation({
    mutationFn: () => api<{ user: StaffUser }>("/api/staff/auth/2fa/enable", { method: "POST", token, body: JSON.stringify({ code }) }),
    onSuccess: (data) => {
      refreshMe(data.user);
      setSetup(null);
      setCode("");
      notify(t("security.nowOn"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const disable = useMutation({
    mutationFn: () => api<{ user: StaffUser }>("/api/staff/auth/2fa/disable", { method: "POST", token, body: JSON.stringify({ password, code }) }),
    onSuccess: (data) => {
      refreshMe(data.user);
      setCode("");
      setPassword("");
      notify(t("security.nowOff"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const on = Boolean(user?.totpEnabled);

  function confirm(event: FormEvent) {
    event.preventDefault();
    enable.mutate();
  }
  function turnOff(event: FormEvent) {
    event.preventDefault();
    disable.mutate();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("security.title")}</h1>
      <p className="mt-1 mb-5 text-sm text-neutral-500">{t("security.intro")}</p>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${on ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-neutral-900">{t("security.twoStep")}</h2>
            <p className="text-sm text-neutral-500">{on ? t("security.statusOn") : t("security.statusOff")}</p>
          </div>
        </div>

        {!on && !setup ? (
          <button type="button" className="btn-rizo mt-4 h-12 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("security.setUp")}
          </button>
        ) : null}

        {!on && setup ? (
          <form onSubmit={confirm} className="mt-4 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
              <li>{t("security.step1")}</li>
              <li>{t("security.step2")}</li>
              <li>{t("security.step3")}</li>
            </ol>
            <div className="flex flex-col items-center gap-2 rounded-xl bg-neutral-50 p-4">
              <img src={setup.qr} alt={t("security.qrAlt")} width={200} height={200} className="rounded-lg bg-white" />
              <p className="text-xs text-neutral-500">{t("security.orType")}</p>
              <code className="rounded bg-white px-2 py-1 text-sm font-bold tracking-widest break-all">{setup.secret}</code>
            </div>
            <Field label={t("security.code")}>
              <input className={inputClass} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" required />
            </Field>
            <button type="submit" className="btn-rizo h-12 w-full" disabled={enable.isPending || code.length !== 6}>
              {enable.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("security.turnOn")}
            </button>
          </form>
        ) : null}

        {on ? (
          <form onSubmit={turnOff} className="mt-4 space-y-4">
            <p className="text-sm text-neutral-600">{t("security.offHint")}</p>
            <Field label={t("common.password")}>
              <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
            <Field label={t("security.code")}>
              <input className={inputClass} inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" required />
            </Field>
            <button type="submit" className="btn-rizo-ghost h-12 w-full" disabled={disable.isPending || code.length !== 6 || !password}>
              {disable.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("security.turnOff")}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
