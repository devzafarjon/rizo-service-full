import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Link2, Printer, QrCode, ScanLine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { LocationBadge, PriorityBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { JobTimerChip } from "../../components/JobTimer";
import { PageSkeleton } from "../../components/PageSkeleton";
import { PauseDialog } from "../../components/PauseDialog";
import { PickupConfirm } from "../../components/PickupConfirm";
import { RequestTimeline } from "../../components/RequestTimeline";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { DecisionPanel, type DecisionPayload } from "../request-panels/DecisionPanel";
import { EstimateBuilder } from "../request-panels/EstimateBuilder";
import { EstimateStatusChip, EstimateView } from "../request-panels/EstimateView";
import { NotesPanel } from "../request-panels/NotesPanel";
import { PaymentsPanel, type PaymentPayload } from "../request-panels/PaymentsPanel";
import { VisitPanel } from "../request-panels/VisitPanel";
import { withApiBase } from "../../lib/apiBase";
import { api, apiErrorMessage } from "../../lib/api";
import { defectLabel, formatDate, formatDateTime, formatMoney, formatPhone, formatRequestId, formatStamp, mapsUrl, technicianTypeLabel } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import { canConfirmPickup } from "../../lib/pickup";
import { nextStatuses, statusLabel } from "../../lib/status";
import type { Priority, RequestDetailPayload, RequestStatus, TechnicianSummary } from "../../lib/types";
import { useNow } from "../../lib/useNow";

const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const DECIDABLE: RequestStatus[] = ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress"];

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const now = useNow(true);
  const [pausing, setPausing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [allowUnpaid, setAllowUnpaid] = useState(false);

  const detail = useQuery({
    queryKey: ["staff", "requests", id],
    enabled: Boolean(token && id),
    queryFn: () => api<RequestDetailPayload>(`/api/staff/requests/${id}`, { token }),
  });
  const techniciansQuery = useQuery({
    queryKey: ["staff", "technicians"],
    enabled: Boolean(token),
    queryFn: () => api<{ technicians: TechnicianSummary[] }>("/api/staff/technicians", { token }),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
  }
  const fail = (error: unknown) => notify(apiErrorMessage(error, t), "error");
  const call = (path: string, method: string, body?: unknown) => api<unknown>(`/api/staff/requests/${id}${path}`, { method, token, body: body === undefined ? undefined : JSON.stringify(body) });

  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => call("", "PATCH", body), onSuccess: async () => { notify(t("slideOver.saved")); await refresh(); }, onError: fail });
  const decide = useMutation({ mutationFn: (body: DecisionPayload) => call("/decision", "POST", body), onSuccess: async () => { notify(t("decision.applied")); await refresh(); }, onError: fail });
  const createEstimate = useMutation({
    mutationFn: (body: { lines: unknown[]; note: string; send: boolean }) => call("/estimates", "POST", body),
    onSuccess: async (_data, vars) => { notify(vars.send ? t("estimate.sent") : t("estimate.saved")); await refresh(); },
    onError: fail,
  });
  const estimateAction = useMutation({
    mutationFn: ({ estimateId, action, reason }: { estimateId: string; action: "approve" | "decline" | "send"; reason?: string }) =>
      call(`/estimates/${estimateId}/${action}`, "POST", action === "decline" ? { reason } : {}),
    onSuccess: async () => { await refresh(); },
    onError: fail,
  });
  const pay = useMutation({ mutationFn: (body: PaymentPayload) => call("/payments", "POST", body), onSuccess: async () => { notify(t("payments.saved")); await refresh(); }, onError: fail });
  const addNote = useMutation({ mutationFn: (body: { text: string; visibleToCustomer: boolean }) => call("/notes", "POST", body), onSuccess: async () => { notify(t("notes.saved")); await refresh(); }, onError: fail });
  const pickup = useMutation({
    mutationFn: (signature: string | null) => call("/pickup", "POST", { signature, allowUnpaid }),
    onSuccess: async () => { notify(t("pickup.saved")); await refresh(); },
    onError: fail,
  });

  if (detail.isLoading) return <PageSkeleton />;
  const data = detail.data;
  const request = data?.request;
  if (!data || !request) return <EmptyState title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;

  const role = user?.role ?? "admin";
  const location = request.customerLocation;
  const next = nextStatuses(role, request);
  const candidates = (techniciansQuery.data?.technicians ?? []).filter((tech) => tech.technicianType === request.technicianTypeRequired);
  const latest = data.estimates[0] ?? null;
  const openEstimate = latest && (latest.status === "sent" || latest.status === "draft") ? latest : null;
  const trackUrl = `${window.location.origin}/t/${request.trackingToken}`;
  const cost = data.cost;
  const showDecision = request.type === "repair" && DECIDABLE.includes(request.status);

  function move(status: RequestStatus) {
    if (status === "paused") setPausing(true);
    else if (status === "cancelled") setCancelling(true);
    else patch.mutate({ status, allowUnpaid: status === "picked_up" ? allowUnpaid : undefined });
  }

  return (
    <div>
      <Link to="/app/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#7B00E0]">
        <ArrowLeft size={16} />
        {t("common.allRequests")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(request.displayId)}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{request.customer.name}</h1>
            <a href={`tel:+${request.customer.phone.replace(/\D/g, "")}`} className="mt-1 inline-block text-sm font-semibold text-[#7B00E0]">
              {formatPhone(request.customer.phone)}
            </a>
            <div className="mt-3 flex flex-wrap gap-2">
              <TypeBadge type={request.type} />
              <StatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
              <WarrantyBadge status={request.warrantyStatus} />
              <LocationBadge type={request.locationType} />
              {request.submittedByCustomer ? <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">{t("requests.submittedByCustomer")}</span> : null}
              {request.isRepeat ? <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.repeat")}</span> : null}
              {request.isLegallyOverdue ? <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{t("detail.legalOverdue")}</span> : null}
              {request.estimate ? <EstimateStatusChip status={request.estimate.status} /> : null}
              {request.payment.balance > 0 ? <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{t("detail.owes", { amount: formatMoney(request.payment.balance) })}</span> : null}
            </div>
            {request.timer ? (
              <div className="mt-3 max-w-xs">
                <JobTimerChip timer={request.timer} now={now} />
              </div>
            ) : null}
            {request.activePause ? <p className="mt-2 text-sm font-semibold text-neutral-600">{t("tech.pausedReason", { reason: request.activePause.reason })}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
            <Link to={`/app/customers/${request.customer.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#7B00E0]">
              {t("common.customerProfile")}
            </Link>
            {request.serialNumber ? (
              <Link to={`/app/serials/${encodeURIComponent(request.serialNumber)}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#7B00E0]">
                <ScanLine size={16} />
                {t("serial.card")}
              </Link>
            ) : null}
            <Link to={`/app/requests/${request.id}/tag`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#7B00E0]">
              <QrCode size={16} />
              {t("tag.print")}
            </Link>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(trackUrl).then(() => notify(t("detail.linkCopied")))}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#7B00E0]"
            >
              <Link2 size={16} />
              {t("detail.copyTrackLink")}
            </button>
            <Link to={`/app/receipts/${request.id}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white hover:bg-[#6500BD]">
              <Printer size={16} />
              {t("detail.printReceipt")}
            </Link>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm text-neutral-700">{request.issueDescription}</p>

        {next.length > 0 ? (
          <div className="mt-5 border-t border-neutral-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-neutral-700">{t("slideOver.moveTo")}</p>
            <div className="flex flex-wrap gap-2">
              {next
                .filter((status) => !["replaced", "refunded", "rejected"].includes(status))
                .map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={patch.isPending}
                    onClick={() => move(status)}
                    className={`h-10 rounded-full px-4 text-sm font-bold disabled:opacity-50 ${status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}
                  >
                    {statusLabel(status)}
                  </button>
                ))}
            </div>
            {request.payment.balance > 0 && next.includes("picked_up") ? (
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
                <input type="checkbox" checked={allowUnpaid} onChange={(event) => setAllowUnpaid(event.target.checked)} />
                {t("detail.allowUnpaid")}
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      {request.rejectionReason ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{t("detail.rejectedBecause", { reason: request.rejectionReason })}</p>
      ) : null}
      {data.repeatOf ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {t("detail.repeatOf")}{" "}
          <Link to={`/app/requests/${data.repeatOf.id}`} className="underline">
            {formatRequestId(data.repeatOf.displayId)}
          </Link>
          {request.decision === "warranty_repair" ? ` · ${t("detail.repeatFree")}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.job")}</h2>
          <dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-neutral-500">{t("common.product")}</dt>
            <dd>
              {localizedName(request.product)}
              <span className="text-neutral-500"> · {request.product.sku}</span>
            </dd>
            <dt className="text-neutral-500">{t("common.category")}</dt>
            <dd>{categoryLabel(request.product.category)}</dd>
            <dt className="text-neutral-500">{t("serial.label")}</dt>
            <dd>
              {request.serialNumber ? (
                <Link to={`/app/serials/${encodeURIComponent(request.serialNumber)}`} className="font-mono font-semibold text-[#7B00E0] hover:underline">
                  {request.serialNumber}
                </Link>
              ) : (
                t("common.dash")
              )}
            </dd>
            <dt className="text-neutral-500">{t("detail.sale")}</dt>
            <dd>{request.sale ? t("detail.saleLine", { invoice: request.sale.invoiceNumber, date: formatDate(request.sale.warrantyExpiry) }) : t("detail.notLinked")}</dd>
            <dt className="text-neutral-500">{t("detail.defect")}</dt>
            <dd>{request.defectType ? defectLabel(request.defectType) : t("common.dash")}</dd>
            {request.type === "repair" ? (
              <>
                <dt className="text-neutral-500">{t("detail.defectCode")}</dt>
                <dd>
                  <select
                    className={`${inputClass} h-10 bg-white`}
                    value={request.defectCodeId ?? ""}
                    onChange={(event) => patch.mutate({ defectCodeId: event.target.value || null })}
                  >
                    <option value="">{t("common.dash")}</option>
                    {data.defectCodes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {localizedName(item)}
                      </option>
                    ))}
                  </select>
                </dd>
              </>
            ) : null}
            {request.decision ? (
              <>
                <dt className="text-neutral-500">{t("decision.title")}</dt>
                <dd>
                  {t(`decision.${request.decision}`)}
                  {request.decisionNote ? <span className="text-neutral-500"> · {request.decisionNote}</span> : null}
                </dd>
              </>
            ) : null}
            {request.resolutionType ? (
              <>
                <dt className="text-neutral-500">{t("job.resolution")}</dt>
                <dd>
                  {t(`resolution.${request.resolutionType}`)}
                  {data.replacement ? ` · ${localizedName(data.replacement)} · ${data.replacement.serialNumber}` : ""}
                </dd>
              </>
            ) : null}
            {request.pickupConfirmationType ? (
              <>
                <dt className="text-neutral-500">{t("detail.pickup")}</dt>
                <dd>{t(`pickup.type.${request.pickupConfirmationType}`)}</dd>
              </>
            ) : null}
            <dt className="text-neutral-500">{t("detail.source")}</dt>
            <dd>{t(`source.${request.source}`)}</dd>
            <dt className="text-neutral-500">{t("detail.payment")}</dt>
            <dd>
              {t(`payment.${request.paymentStatus}`)}
              {request.isPaidRepair ? ` · ${t("common.paidRepair")}` : ""}
            </dd>
            {request.fiscalReceiptNumber ? (
              <>
                <dt className="text-neutral-500">{t("payments.fiscal")}</dt>
                <dd className="font-mono">{request.fiscalReceiptNumber}</dd>
              </>
            ) : null}
            <dt className="text-neutral-500">{t("common.created")}</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
            {request.legalDueAt ? (
              <>
                <dt className="text-neutral-500">{t("detail.legalDue")}</dt>
                <dd className={request.isLegallyOverdue ? "font-bold text-red-700" : ""}>{formatDateTime(request.legalDueAt)}</dd>
              </>
            ) : null}
            {request.repairWarrantyUntil ? (
              <>
                <dt className="text-neutral-500">{t("detail.repairWarranty")}</dt>
                <dd>{formatDate(request.repairWarrantyUntil)}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.assignment")}</h2>
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-semibold text-neutral-700">
              {t("common.technician")} <span className="font-normal text-neutral-500">({technicianTypeLabel(request.technicianTypeRequired)})</span>
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
              <select className={`${inputClass} mt-1 bg-white`} value={request.priority} disabled={patch.isPending} onChange={(event) => patch.mutate({ priority: event.target.value })}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`priority.${priority}`)}
                  </option>
                ))}
              </select>
            </label>
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm">
              <dt className="text-neutral-500">{t("detail.location")}</dt>
              <dd>{t(`location.${request.locationType}`)}</dd>
              {request.serviceCenter ? (
                <>
                  <dt className="text-neutral-500">{t("centers.center")}</dt>
                  <dd>{request.serviceCenter.name}</dd>
                </>
              ) : null}
              {request.scheduledAt ? (
                <>
                  <dt className="text-neutral-500">{t("detail.scheduled")}</dt>
                  <dd className="font-semibold">{formatStamp(request.scheduledAt)}</dd>
                </>
              ) : null}
              {request.enRouteAt ? (
                <>
                  <dt className="text-neutral-500">{t("detail.enRoute")}</dt>
                  <dd>{formatStamp(request.enRouteAt)}</dd>
                </>
              ) : null}
              {location ? (
                <>
                  <dt className="text-neutral-500">{t("detail.address")}</dt>
                  <dd>
                    <p>{location.address}</p>
                    {location.lat != null && location.lng != null ? <p className="text-xs text-neutral-500">{location.lat}, {location.lng}</p> : null}
                    <a href={mapsUrl(location)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-[#7B00E0]">
                      {t("maps.directions")}
                      <ExternalLink size={14} />
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </section>
      </div>

      <VisitPanel request={request} token={token} canEdit={role === "admin" || role === "receptionist"} onChanged={refresh} />

      {request.intakeChecklist.length > 0 || request.intakeNotes || request.intakeSignatureUrl ? (
        <Card title={t("intake.title")}>
          {request.intakeChecklist.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {request.intakeChecklist.map((item) => (
                <li key={item} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {t(`intake.items.${item}`, { defaultValue: item })}
                </li>
              ))}
            </ul>
          ) : null}
          {request.intakeNotes ? <p className="mt-3 text-sm text-neutral-700">{request.intakeNotes}</p> : null}
          {request.intakeSignatureUrl ? <img src={withApiBase(request.intakeSignatureUrl)} alt={t("intake.signature")} className="mt-3 h-24 rounded-xl border border-neutral-200 bg-white p-2" /> : null}
        </Card>
      ) : null}

      {showDecision && role !== "technician" ? (
        <Card title={t("decision.title")} hint={t("decision.hint")}>
          <DecisionPanel request={request} returnReasons={data.returnReasons} busy={decide.isPending} onSubmit={(payload) => decide.mutate(payload)} />
        </Card>
      ) : null}

      {request.type === "repair" ? (
        <Card title={t("estimate.title")} hint={t("estimate.hint")}>
          <div className="space-y-4">
            {data.estimates.map((estimate) => (
              <EstimateView
                key={estimate.id}
                estimate={estimate}
                busy={estimateAction.isPending}
                onApproveForCustomer={estimate.status === "sent" || estimate.status === "draft" ? () => estimateAction.mutate({ estimateId: estimate.id, action: "approve" }) : undefined}
                onDecline={estimate.status === "sent" ? (reason) => estimateAction.mutate({ estimateId: estimate.id, action: "decline", reason }) : undefined}
              />
            ))}
            {openEstimate && openEstimate.status === "draft" ? (
              <button type="button" onClick={() => estimateAction.mutate({ estimateId: openEstimate.id, action: "send" })} className="h-11 rounded-lg bg-[#7B00E0] px-5 text-sm font-bold text-white">
                {t("estimate.sendToCustomer")}
              </button>
            ) : null}
            {!openEstimate && DECIDABLE.includes(request.status) ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-neutral-700">{t("estimate.newEstimate")}</p>
                <EstimateBuilder services={data.matchingServices} parts={data.matchingParts} busy={createEstimate.isPending} onSubmit={(payload) => createEstimate.mutate(payload)} />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title={t("detail.timeline")}>
        <p className="-mt-3 mb-4 text-xs text-neutral-500">{t("detail.timelineHint")}</p>
        <RequestTimeline events={data.timeline} />
      </Card>

      {data.serviceLines.length + data.partLines.length + data.extraExpenses.length + data.photos.length > 0 ? (
        <Card title={t("detail.completion")}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold">{t("detail.servicesUsed")}</p>
              {data.serviceLines.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">{t("common.noneYet")}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {data.serviceLines.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>{localizedName(item)}</span>
                      <span className="text-neutral-500">{formatMoney(item.priceAtTime)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-bold">{t("detail.partsUsed")}</p>
              {data.partLines.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">{t("common.noneYet")}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {data.partLines.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span>
                        {localizedName(item)}
                        <span className="text-neutral-400"> × {item.quantity}</span>
                      </span>
                      <span className="text-neutral-500">{formatMoney(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {data.extraExpenses.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-bold">{t("detail.extras")}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.extraExpenses.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>{item.description}</span>
                    <span className="text-neutral-500">{formatMoney(item.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.photos.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {data.photos.map((photo) => (
                <img key={photo.id} src={withApiBase(photo.photoUrl)} alt={t("common.jobPhoto")} className="h-24 w-full rounded-xl object-cover" />
              ))}
            </div>
          ) : null}
          <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-extrabold ${cost.coveredByWarranty ? "bg-emerald-50 text-emerald-800" : "bg-[#FFF4E5] text-[#C56A00]"}`}>
            {cost.coveredByWarranty ? t("detail.warrantyPays", { amount: formatMoney(cost.chargedTotal) }) : t("detail.customerPays", { amount: formatMoney(cost.chargedTotal) })}
          </p>
        </Card>
      ) : null}

      <Card title={t("payments.title")}>
        <PaymentsPanel summary={data.paymentSummary} payments={data.payments} fiscalReceiptNumber={request.fiscalReceiptNumber} requireFiscal={data.settings?.requireFiscalReceipt} busy={pay.isPending} onSubmit={(payload) => pay.mutate(payload)} />
      </Card>

      <Card title={t("notes.title")} hint={t("notes.hint")}>
        <NotesPanel notes={data.notes} busy={addNote.isPending} onSubmit={(text, visibleToCustomer) => addNote.mutate({ text, visibleToCustomer })} />
      </Card>

      {request.pickupConfirmedAt && request.locationType === "in_shop" ? (
        <p className="mt-4 text-sm font-bold text-emerald-700">{t("pickup.already")}</p>
      ) : canConfirmPickup(request) ? (
        <div className="mt-4">
          <PickupConfirm pending={pickup.isPending} onConfirm={(signature) => pickup.mutateAsync(signature)} />
        </div>
      ) : null}

      <PauseDialog
        name={pausing ? request.customer.name : null}
        busy={patch.isPending}
        onClose={() => setPausing(false)}
        onSubmit={(pauseHours, pauseReason) => patch.mutate({ status: "paused", pauseHours, pauseReason }, { onSuccess: () => setPausing(false) })}
      />
      <ConfirmDialog
        open={cancelling}
        title={t("slideOver.cancelTitle")}
        body={t("slideOver.cancelBody")}
        confirmLabel={t("slideOver.cancelConfirm")}
        onClose={() => setCancelling(false)}
        onConfirm={() => patch.mutate({ status: "cancelled" }, { onSuccess: () => setCancelling(false) })}
      />
    </div>
  );
}
