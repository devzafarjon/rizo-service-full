import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Navigation, Printer, QrCode, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LocationBadge, PriorityBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { inputClass } from "../../components/Field";
import { JobTimerChip } from "../../components/JobTimer";
import { PauseDialog } from "../../components/PauseDialog";
import { RequestTimeline } from "../../components/RequestTimeline";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { defectLabel, formatDateTime, formatMoney, formatPhone, formatRequestId, mapsUrl, technicianTypeLabel } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { nextStatuses, statusLabel } from "../../lib/status";
import type { JobCost, Priority, RequestStatus, ServiceRequest, TechnicianSummary, TimelineEvent } from "../../lib/types";
import { useNow } from "../../lib/useNow";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

type Detail = { request: ServiceRequest; timeline: TimelineEvent[]; cost: JobCost };

/** Right-hand panel that opens when a card is clicked; the full page stays one click away. */
export function RequestSlideOver({
  requestId,
  technicians,
  onClose,
}: {
  requestId: string | null;
  technicians: TechnicianSummary[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const now = useNow(Boolean(requestId));
  const [pausing, setPausing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const detail = useQuery({
    queryKey: ["staff", "requests", requestId],
    enabled: Boolean(token && requestId),
    queryFn: () => api<Detail>(`/api/staff/requests/${requestId}`, { token }),
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ request: ServiceRequest }>(`/api/staff/requests/${requestId}`, { method: "PATCH", token, body: JSON.stringify(body) }),
    onSuccess: () => notify(t("slideOver.saved")),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
    },
  });

  const request = detail.data?.request;
  const next = request ? nextStatuses(user?.role ?? "admin", request).filter((status) => !["replaced", "refunded", "rejected"].includes(status)) : [];
  const candidates = request ? technicians.filter((tech) => tech.technicianType === request.technicianTypeRequired) : [];

  function goTo(status: RequestStatus) {
    if (status === "paused") setPausing(true);
    else if (status === "cancelled") setCancelling(true);
    else patch.mutate({ status });
  }

  return (
    <Dialog open={Boolean(requestId)} onClose={onClose} className="relative z-[70]">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex justify-end">
        <DialogPanel className="flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:max-w-lg">
          <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4">
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{request ? formatRequestId(request.displayId) : "…"}</p>
              <DialogTitle className="truncate text-lg font-extrabold tracking-tight text-neutral-900">
                {request?.customer.name ?? t("common.loading")}
              </DialogTitle>
              {request ? (
                <a href={`tel:+${request.customer.phone.replace(/\D/g, "")}`} className="text-sm font-semibold text-[#7B00E0]">
                  {formatPhone(request.customer.phone)}
                </a>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-black"
            >
              <X size={20} />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {detail.isLoading || !request ? (
              <p className="py-10 text-center text-sm text-neutral-500">{t("common.loading")}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <TypeBadge type={request.type} />
                  <StatusBadge status={request.status} />
                  <PriorityBadge priority={request.priority} />
                  <WarrantyBadge status={request.warrantyStatus} />
                  <LocationBadge type={request.locationType} />
                  {request.isLegallyOverdue ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{t("detail.legalOverdue")}</span>
                  ) : null}
                  {request.isRepeat ? <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.repeat")}</span> : null}
                  {request.payment.balance > 0 ? (
                    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.owes", { amount: formatMoney(request.payment.balance) })}</span>
                  ) : null}
                  {request.isOverdue ? (
                    <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">{t("kanban.overdue")}</span>
                  ) : null}
                  {request.submittedByCustomer ? (
                    <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">{t("requests.customerChip")}</span>
                  ) : null}
                </div>

                {request.timer ? <JobTimerChip timer={request.timer} now={now} /> : null}
                {request.activePause ? (
                  <p className="text-sm font-semibold text-neutral-600">{t("tech.pausedReason", { reason: request.activePause.reason })}</p>
                ) : null}

                <p className="text-sm text-neutral-700">{request.issueDescription}</p>

                <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-y-2 text-sm">
                  <dt className="text-neutral-500">{t("common.product")}</dt>
                  <dd>{localizedName(request.product)}</dd>
                  <dt className="text-neutral-500">{t("detail.sale")}</dt>
                  <dd>{request.sale ? request.sale.invoiceNumber : t("detail.notLinked")}</dd>
                  {request.defectType ? (
                    <>
                      <dt className="text-neutral-500">{t("detail.defect")}</dt>
                      <dd>{defectLabel(request.defectType)}</dd>
                    </>
                  ) : null}
                  <dt className="text-neutral-500">{t("detail.required")}</dt>
                  <dd>{technicianTypeLabel(request.technicianTypeRequired)}</dd>
                  {request.serialNumber ? (
                    <>
                      <dt className="text-neutral-500">{t("serial.label")}</dt>
                      <dd className="font-mono">{request.serialNumber}</dd>
                    </>
                  ) : null}
                  {request.decision ? (
                    <>
                      <dt className="text-neutral-500">{t("decision.title")}</dt>
                      <dd>{t(`decision.${request.decision}`)}</dd>
                    </>
                  ) : null}
                  <dt className="text-neutral-500">{t("common.created")}</dt>
                  <dd>{formatDateTime(request.createdAt)}</dd>
                  {request.finalCost != null ? (
                    <>
                      <dt className="text-neutral-500">{t("slideOver.total")}</dt>
                      <dd className="font-bold">{formatMoney(request.finalCost)}</dd>
                    </>
                  ) : null}
                </dl>

                {request.customerLocation ? (
                  <div className="rounded-xl bg-neutral-50 p-3 text-sm">
                    <p className="font-semibold">{request.customerLocation.address}</p>
                    <a
                      href={mapsUrl(request.customerLocation)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 font-bold text-[#7B00E0]"
                    >
                      <Navigation size={14} />
                      {t("maps.directions")}
                    </a>
                  </div>
                ) : null}

                <section className="space-y-3">
                  <h3 className="text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("slideOver.manage")}</h3>
                  <label className="block text-sm font-semibold text-neutral-700">
                    {t("common.technician")}
                    <select
                      className={`${inputClass} mt-1 bg-white`}
                      value={request.assignedTechnicianId ?? ""}
                      disabled={patch.isPending}
                      onChange={(event) => patch.mutate({ assignedTechnicianId: event.target.value || null })}
                    >
                      <option value="">{t("common.unassigned")}</option>
                      {candidates.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name} · {tech.isAvailable ? t("common.free") : t("shell.busy")} · {t("kanban.openJobs", { count: tech.openJobCount })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-neutral-700">
                    {t("common.priority")}
                    <select
                      className={`${inputClass} mt-1 bg-white`}
                      value={request.priority}
                      disabled={patch.isPending}
                      onChange={(event) => patch.mutate({ priority: event.target.value })}
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {t(`priority.${priority}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {next.length > 0 ? (
                    <div>
                      <p className="mb-1 text-sm font-semibold text-neutral-700">{t("slideOver.moveTo")}</p>
                      <div className="flex flex-wrap gap-2">
                        {next.map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={patch.isPending}
                            onClick={() => goTo(status)}
                            className={`h-10 rounded-full px-4 text-sm font-bold disabled:opacity-50 ${
                              status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                            }`}
                          >
                            {statusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("detail.timeline")}</h3>
                  <RequestTimeline events={detail.data?.timeline ?? []} />
                </section>
              </>
            )}
          </div>

          {request ? (
            <footer className="grid grid-cols-3 gap-2 border-t border-neutral-200 px-5 py-3">
              <Link to={`/app/requests/${request.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#7B00E0] text-sm font-bold text-white hover:bg-[#6500BD]">
                <ExternalLink size={15} />
                {t("slideOver.openFull")}
              </Link>
              <Link to={`/app/receipts/${request.id}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-800">
                <Printer size={15} />
                {t("slideOver.receipt")}
              </Link>
              <Link to={`/app/requests/${request.id}/tag`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-800">
                <QrCode size={15} />
                {t("slideOver.tag")}
              </Link>
            </footer>
          ) : null}
        </DialogPanel>
      </div>

      <PauseDialog
        name={pausing ? (request?.customer.name ?? "") : null}
        busy={patch.isPending}
        onClose={() => setPausing(false)}
        onSubmit={(pauseHours, pauseReason) =>
          patch.mutate({ status: "paused", pauseHours, pauseReason }, { onSuccess: () => setPausing(false) })
        }
      />
      <ConfirmDialog
        open={cancelling}
        title={t("slideOver.cancelTitle")}
        body={t("slideOver.cancelBody")}
        confirmLabel={t("slideOver.cancelConfirm")}
        onClose={() => setCancelling(false)}
        onConfirm={() => patch.mutate({ status: "cancelled" }, { onSuccess: () => setCancelling(false) })}
      />
    </Dialog>
  );
}
