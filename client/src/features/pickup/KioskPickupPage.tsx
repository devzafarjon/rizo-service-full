import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PickupConfirm } from "../../components/PickupConfirm";
import { inputClass } from "../../components/Field";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatPhone, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { parseRequestTag } from "../../lib/qrTag";
import { canConfirmPickup } from "../../lib/pickup";
import type { ServiceRequest } from "../../lib/types";

export function KioskPickupPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [displayId, setDisplayId] = useState("");

  const found = useQuery({
    queryKey: ["staff", "tags", displayId],
    enabled: Boolean(token && displayId),
    queryFn: () => api<{ request: ServiceRequest }>(`/api/staff/tags/${encodeURIComponent(displayId)}`, { token }),
  });

  const confirm = useMutation({
    mutationFn: (signature: string | null) =>
      api(`/api/staff/requests/${found.data!.request.id}/pickup`, {
        method: "POST",
        token,
        body: JSON.stringify({ signature }),
      }),
    onSuccess: async () => {
      notify(t("pickup.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "tags", displayId] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const request = found.data?.request;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("kiosk.title")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("kiosk.hint")}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = parseRequestTag(raw);
          if (!parsed) {
            notify(t("tag.invalid"), "error");
            return;
          }
          setDisplayId(parsed);
        }}
      >
        <input
          className={`${inputClass} min-w-0 flex-1`}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder={t("tag.manualPlaceholder")}
        />
        <button type="submit" className="h-12 shrink-0 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("tag.open")}
        </button>
      </form>
      {displayId && found.isFetching && !request ? <p className="mt-6 text-sm text-neutral-500">{t("common.loading")}</p> : null}
      {displayId && found.isError ? (
        <p className="mt-6 text-sm font-medium text-red-600">{apiErrorMessage(found.error, t)}</p>
      ) : null}
      {request ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="font-mono text-xs font-bold text-neutral-400">{formatRequestId(request.displayId)}</p>
            <h2 className="mt-1 text-xl font-extrabold">{request.customer.name}</h2>
            <p className="text-sm text-neutral-500">
              {localizedName(request.product)} · {formatPhone(request.customer.phone)}
            </p>
            {request.pickupConfirmedAt ? <p className="mt-3 text-sm font-bold text-emerald-700">{t("pickup.already")}</p> : null}
            {!request.pickupConfirmedAt && request.locationType !== "in_shop" ? (
              <p className="mt-3 text-sm text-neutral-500">{t("pickup.notAtCounter")}</p>
            ) : null}
            {!request.pickupConfirmedAt && request.locationType === "in_shop" && !canConfirmPickup(request) ? (
              <p className="mt-3 text-sm text-neutral-500">{t("pickup.notReady")}</p>
            ) : null}
          </div>
          {canConfirmPickup(request) ? <PickupConfirm pending={confirm.isPending} onConfirm={(signature) => confirm.mutateAsync(signature)} /> : null}
        </div>
      ) : null}
    </div>
  );
}
