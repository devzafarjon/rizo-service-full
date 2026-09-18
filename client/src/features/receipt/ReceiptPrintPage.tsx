import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { Field, textareaClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import type { JobCost, JobExtraExpense, JobPartLine, JobServiceLine, JobWorkPayload, ServiceRequest } from "../../lib/types";
import { ReceiptDocument } from "./ReceiptDocument";
import { loadDisclaimer, saveDisclaimer } from "./disclaimer";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";

type ReceiptPayload = {
  request: ServiceRequest;
  serviceLines: JobServiceLine[];
  partLines: JobPartLine[];
  extraExpenses: JobExtraExpense[];
  cost: JobCost;
};

export function ReceiptPrintPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const { token, user } = useStaffAuth();
  const technicianView = location.pathname.startsWith("/app/my-jobs");
  const [disclaimer, setDisclaimer] = useState(() => (id ? loadDisclaimer(id) : t("receipt.disclaimerDefault")));

  const detail = useQuery({
    queryKey: ["staff", technicianView ? "my-jobs" : "requests", id, "receipt"],
    enabled: Boolean(token && id),
    queryFn: async () => {
      if (technicianView) {
        const data = await api<JobWorkPayload>(`/api/staff/my-jobs/${id}`, { token });
        return {
          request: data.job,
          serviceLines: data.serviceLines,
          partLines: data.partLines,
          extraExpenses: data.extraExpenses,
          cost: data.cost,
        } satisfies ReceiptPayload;
      }
      return api<ReceiptPayload>(`/api/staff/requests/${id}`, { token });
    },
  });

  useEffect(() => {
    if (id) setDisclaimer(loadDisclaimer(id));
  }, [id, i18n.language]);

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const data = detail.data;
  if (!data) {
    return <EmptyState title={t("receipt.notFoundTitle")} body={t("receipt.notFoundBody")} />;
  }

  const backTo = technicianView ? `/app/my-jobs/${id}/complete` : `/app/requests/${id}`;

  function onDisclaimer(value: string) {
    setDisclaimer(value);
    if (id) saveDisclaimer(id, value);
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#B439FD]">
          <ArrowLeft size={16} />
          {t("common.back")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
          >
            <Printer size={16} />
            {t("receipt.printReceipt")}
          </button>
        </div>
      </div>

      <section className="no-print mb-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <Field
          label={t("receipt.disclaimer")}
          hint={t("receipt.disclaimerHint")}
        >
          <textarea className={textareaClass} value={disclaimer} onChange={(event) => onDisclaimer(event.target.value)} rows={4} />
        </Field>
      </section>

      <ReceiptDocument
        request={data.request}
        serviceLines={data.serviceLines}
        partLines={data.partLines}
        extraExpenses={data.extraExpenses}
        cost={data.cost}
        issuedBy={user?.name ?? t("receipt.staffFallback")}
        disclaimer={disclaimer}
      />
    </div>
  );
}
