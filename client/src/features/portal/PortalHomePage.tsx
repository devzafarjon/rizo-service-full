import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LocationBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api } from "../../lib/api";
import { formatDateTime, formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { isDoneStatus } from "../../lib/status";
import type { PortalRequest, ServiceType } from "../../lib/types";
import { FeedbackForm } from "./FeedbackForm";

const TYPE_FILTERS: Array<"" | ServiceType> = ["", "installation", "repair"];
const SCOPE_FILTERS = ["all", "open", "done"] as const;

export function PortalHomePage() {
  const { t } = useTranslation();
  const { user, token } = useCustomerAuth();
  const [type, setType] = useState<"" | ServiceType>("");
  const [scope, setScope] = useState<"all" | "open" | "done">("all");

  const list = useQuery({
    queryKey: ["customer", "requests"],
    enabled: Boolean(token),
    queryFn: () => api<{ requests: PortalRequest[] }>("/api/customer/requests", { token }),
  });

  const requests = useMemo(() => {
    return (list.data?.requests ?? []).filter((request) => {
      if (type && request.type !== type) return false;
      if (scope === "open" && isDoneStatus(request.status)) return false;
      if (scope === "done" && !isDoneStatus(request.status)) return false;
      return true;
    });
  }, [list.data?.requests, type, scope]);

  const pendingFeedback = (list.data?.requests ?? []).filter((request) => request.canFeedback);

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-[#B439FD]">{t("portal.hello", { name: user?.name.split(" ")[0] })}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{t("portal.homeTitle")}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t("portal.homeIntro")}</p>

      {pendingFeedback.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-[#FFF4E5] px-4 py-3 text-sm font-semibold text-[#C56A00]">
          {t("portal.pendingFeedback", { count: pendingFeedback.length })}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {SCOPE_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold ${
              scope === value ? "bg-[#B439FD] text-white" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {value === "all" ? t("common.all") : value === "open" ? t("portal.open") : t("common.completed")}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {TYPE_FILTERS.map((item) => (
          <button
            key={item || "all"}
            type="button"
            onClick={() => setType(item)}
            className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold ${
              type === item ? "bg-[#B439FD] text-white" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            {item ? t(`type.${item}`) : t("requests.allTypes")}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t("portal.emptyTitle")}
            body={t("portal.emptyBody")}
            action={
              <Link
                to="/portal/new"
                className="btn-rizo-sm"
              >
                {t("portal.newTitle")}
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                to={`/portal/requests/${request.id}`}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-neutral-900">{localizedName(request.product)}</p>
                    <p className="mt-1 font-mono text-xs font-semibold text-neutral-400">{formatRequestId(request.displayId)}</p>
                    <p className="mt-1 text-xs text-neutral-500">{formatDateTime(request.createdAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <TypeBadge type={request.type} />
                  <WarrantyBadge status={request.warrantyStatus} />
                  <LocationBadge type={request.locationType} />
                </div>
                {request.assignedTechnician ? (
                  <p className="mt-3 text-sm text-neutral-600">{t("portal.technicianLine", { name: request.assignedTechnician.name })}</p>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">{t("portal.waitingTech")}</p>
                )}
              </Link>
              {request.canFeedback ? (
                <div className="mt-2">
                  <FeedbackForm request={request} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
