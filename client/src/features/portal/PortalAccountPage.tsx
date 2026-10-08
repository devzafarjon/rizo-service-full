import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, MessageCircle, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { withApiBase } from "../../lib/apiBase";
import type { CustomerUser } from "../../lib/types";
import { segmentedGroupClass, segmentedItemClass } from "../../components/segmented";

const CHANNELS = ["both", "sms", "telegram"] as const;

/** How the customer is told about their requests, and control over their own data. */
export function PortalAccountPage() {
  const { t } = useTranslation();
  const { token, user } = useCustomerAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const setChannel = useMutation({
    mutationFn: (preferredChannel: (typeof CHANNELS)[number]) => api<{ user: CustomerUser }>("/api/customer/auth/preferences", { method: "PATCH", token, body: JSON.stringify({ preferredChannel }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["customer", "me", token], data.user);
      notify(t("account.saved"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const requestDelete = useMutation({
    mutationFn: (cancel: boolean) => api("/api/customer/auth/me/delete-request", { method: cancel ? "DELETE" : "POST", token }),
    onSuccess: async (_data, cancel) => {
      notify(cancel ? t("account.deleteCancelled") : t("account.deleteAsked"));
      await queryClient.invalidateQueries({ queryKey: ["customer", "me"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  async function exportData() {
    try {
      const res = await fetch(withApiBase("/api/customer/auth/me/export"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("export");
      const blob = new Blob([await res.text()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "rizo-my-data.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      notify(t("errors.generic"), "error");
    }
  }

  if (!user) return null;
  const channel = user.preferredChannel ?? "both";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("account.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("account.intro")}</p>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-neutral-800 uppercase">
          <MessageCircle size={16} className="text-[#7B00E0]" />
          {t("account.channel")}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{t("account.channelBody")}</p>
        <div className={`${segmentedGroupClass} mt-3`}>
          {CHANNELS.map((item) => (
            <button key={item} type="button" disabled={setChannel.isPending} onClick={() => setChannel.mutate(item)} className={`${segmentedItemClass(channel === item)} disabled:opacity-60`}>
              {t(`account.channels.${item}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">{user.telegramLinked ? t("account.telegramLinked") : t("account.telegramHow")}</p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold tracking-wide text-neutral-800 uppercase">{t("account.data")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("account.dataBody")}</p>
        <button type="button" className="btn-rizo-ghost mt-3 h-11" onClick={() => void exportData()}>
          <Download size={16} />
          {t("account.export")}
        </button>
        <div className="mt-5 border-t border-neutral-100 pt-4">
          {user.deletionRequested ? (
            <>
              <p className="text-sm font-semibold text-amber-800">{t("account.deletePending")}</p>
              <button type="button" className="mt-2 text-sm font-bold text-[#7B00E0] hover:underline" onClick={() => requestDelete.mutate(true)} disabled={requestDelete.isPending}>
                {t("account.deleteWithdraw")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-600">{t("account.deleteBody")}</p>
              <button type="button" className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-red-700 hover:bg-red-50" disabled={requestDelete.isPending} onClick={() => window.confirm(t("account.deleteConfirm")) && requestDelete.mutate(false)}>
                {requestDelete.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 size={16} />}
                {t("account.deleteAsk")}
              </button>
            </>
          )}
        </div>
      </section>

      <p className="text-center text-xs text-neutral-500">
        <Link to="/privacy" className="font-semibold text-[#7B00E0] hover:underline">
          {t("legal.privacy")}
        </Link>
        {" · "}
        <Link to="/terms" className="font-semibold text-[#7B00E0] hover:underline">
          {t("legal.terms")}
        </Link>
      </p>
    </div>
  );
}
