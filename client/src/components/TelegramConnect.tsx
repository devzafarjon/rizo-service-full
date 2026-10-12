import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "./Spinner";
import { useToast } from "./toast";
import { api, apiErrorMessage } from "../lib/api";

type Status = { configured: boolean; username: string | null; mode: "webhook" | "polling"; linked: boolean; notify?: boolean };

/**
 * Connects the signed-in person to the RIZO Telegram bot with a one-time link (no phone number to type), shows whether it is
 * connected, and disconnects. Staff can also mute the alerts that Telegram receives. Used by the customer portal and by staff.
 */
export function TelegramConnect({ scope, token, isAdmin = false }: { scope: "staff" | "customer"; token: string | null; isAdmin?: boolean }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/${scope}/telegram`;
  const key = [scope, "telegram", token];

  const status = useQuery({ queryKey: key, enabled: Boolean(token), queryFn: () => api<Status>(base, { token }) });
  const refresh = (data: Status) => queryClient.setQueryData(key, data);

  const connect = useMutation({
    mutationFn: () => api<{ url: string }>(`${base}/link`, { method: "POST", token }),
    onSuccess: (data) => {
      window.open(data.url, "_blank", "noopener");
      // The chat links itself once the person presses Start in Telegram: look again in a few seconds.
      for (const delay of [4000, 10000, 20000]) window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: key }), delay);
      notify(t("telegram.opened"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const disconnect = useMutation({
    mutationFn: () => api<Status>(base, { method: "DELETE", token }),
    onSuccess: (data) => {
      refresh(data);
      queryClient.invalidateQueries({ queryKey: ["customer", "me"] });
      notify(t("telegram.disconnected"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const mute = useMutation({
    mutationFn: (value: boolean) => api<Status>(base, { method: "PATCH", token, body: JSON.stringify({ notify: value }) }),
    onSuccess: refresh,
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  // The account menu links here with #telegram.
  useEffect(() => {
    if (window.location.hash === "#telegram") document.getElementById("telegram")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [status.isLoading]);

  const data = status.data;
  return (
    <section id="telegram" className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${data?.linked ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
          <Send size={20} />
        </span>
        <div>
          <h2 className="font-bold text-neutral-900">{t("telegram.title")}</h2>
          <p className="text-sm text-neutral-500">{data?.linked ? t("telegram.connected") : t("telegram.notConnected")}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-neutral-600">{t(scope === "staff" ? "telegram.staffBody" : "telegram.customerBody")}</p>

      {status.isLoading ? (
        <Spinner className="mt-3 h-5 w-5" />
      ) : data && !data.configured ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t(isAdmin ? "telegram.notSetUpAdmin" : "telegram.notSetUp")}</p>
      ) : data?.linked ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {scope === "staff" ? (
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <input type="checkbox" checked={data.notify !== false} disabled={mute.isPending} onChange={(event) => mute.mutate(event.target.checked)} />
              {t("telegram.alertsOn")}
            </label>
          ) : null}
          <button type="button" className="h-11 rounded-xl px-4 text-sm font-semibold text-red-600 hover:bg-red-50" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {t("telegram.disconnect")}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <button type="button" className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#229ED9] px-6 text-[12.8px] font-bold text-white disabled:opacity-70" disabled={connect.isPending} onClick={() => connect.mutate()}>
            {connect.isPending ? <Spinner className="h-4 w-4" /> : <Send size={16} />}
            {t("telegram.connect")}
          </button>
          <p className="mt-2 text-xs text-neutral-500">{t("telegram.connectHint")}</p>
        </div>
      )}
    </section>
  );
}
