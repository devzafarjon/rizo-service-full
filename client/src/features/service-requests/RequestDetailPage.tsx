import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Printer, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { LocationBadge, PriorityBadge, StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { PickupConfirm } from "../../components/PickupConfirm";
import { useToast } from "../../components/toast";
import { PageSkeleton } from "../../components/PageSkeleton";
import { RequestTimeline } from "../../components/RequestTimeline";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { defectLabel, formatDate, formatDateTime, formatMoney, formatPhone, formatRequestId, mapsUrl, technicianTypeLabel } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import type { JobCost, JobExtraExpense, JobPartLine, JobPhoto, JobServiceLine, Named, ServiceRequest, TimelineEvent } from "../../lib/types";

export function RequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["staff", "requests", id],
    enabled: Boolean(token && id),
    queryFn: () =>
      api<{
        request: ServiceRequest;
        matchingServices: Array<Named & { id: string; price: number; productCategory: string }>;
        matchingParts: Array<Named & { id: string; price: number; productCategory: string; stockQuantity: number }>;
        serviceLines: JobServiceLine[];
        partLines: JobPartLine[];
        extraExpenses: JobExtraExpense[];
        photos: JobPhoto[];
        cost: JobCost;
        timeline: TimelineEvent[];
      }>(`/api/staff/requests/${id}`, {
        token,
      }),
  });
  const pickup = useMutation({
    mutationFn: (signature: string | null) =>
      api(`/api/staff/requests/${id}/pickup`, { method: "POST", token, body: JSON.stringify({ signature }) }),
    onSuccess: async () => {
      notify(t("pickup.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "requests", id] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (detail.isLoading) {
    return <PageSkeleton />;
  }

  const request = detail.data?.request;
  if (!request) {
    return <EmptyState title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;
  }

  const services = detail.data?.matchingServices ?? [];
  const parts = detail.data?.matchingParts ?? [];
  const location = request.customerLocation;
  const serviceLines = detail.data?.serviceLines ?? [];
  const partLines = detail.data?.partLines ?? [];
  const extraExpenses = detail.data?.extraExpenses ?? [];
  const photos = detail.data?.photos ?? [];
  const cost = detail.data?.cost;
  const timeline = detail.data?.timeline ?? [];

  return (
    <div>
      <Link to="/app/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#B439FD]">
        <ArrowLeft size={16} />
        {t("common.allRequests")}
      </Link>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold tracking-wide text-neutral-400">{formatRequestId(request.displayId)}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{request.customer.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">{formatPhone(request.customer.phone)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TypeBadge type={request.type} />
              <StatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
              <WarrantyBadge status={request.warrantyStatus} />
              <LocationBadge type={request.locationType} />
              {request.submittedByCustomer ? (
                <span className="inline-flex rounded-full bg-[#FFF4E5] px-2.5 py-1 text-xs font-bold text-[#C56A00]">{t("requests.submittedByCustomer")}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Link to={`/app/customers/${request.customer.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#B439FD]">
              {t("common.customerProfile")}
            </Link>
            <Link
              to={`/app/requests/${request.id}/tag`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#B439FD]"
            >
              <QrCode size={16} />
              {t("tag.print")}
            </Link>
            <Link
              to={`/app/receipts/${request.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
            >
              <Printer size={16} />
              {t("detail.printReceipt")}
            </Link>
          </div>
        </div>
        <p className="mt-5 max-w-3xl text-sm text-neutral-700">{request.issueDescription}</p>
      </div>

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
            <dt className="text-neutral-500">{t("detail.sale")}</dt>
            <dd>{request.sale ? t("detail.saleLine", { invoice: request.sale.invoiceNumber, date: formatDate(request.sale.warrantyExpiry) }) : t("detail.notLinked")}</dd>
            <dt className="text-neutral-500">{t("detail.defect")}</dt>
            <dd>{request.defectType ? defectLabel(request.defectType) : t("common.dash")}</dd>
            <dt className="text-neutral-500">{t("detail.source")}</dt>
            <dd>{t(`source.${request.source}`)}</dd>
            <dt className="text-neutral-500">{t("detail.payment")}</dt>
            <dd>
              {t(`payment.${request.paymentStatus}`)}
              {request.isPaidRepair ? ` · ${t("common.paidRepair")}` : ""}
            </dd>
            <dt className="text-neutral-500">{t("common.created")}</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.assignment")}</h2>
          <dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-neutral-500">{t("detail.required")}</dt>
            <dd>{technicianTypeLabel(request.technicianTypeRequired)}</dd>
            <dt className="text-neutral-500">{t("common.technician")}</dt>
            <dd>{request.assignedTechnician?.name ?? t("common.unassigned")}</dd>
            <dt className="text-neutral-500">{t("detail.location")}</dt>
            <dd>{t(`location.${request.locationType}`)}</dd>
            {location ? (
              <>
                <dt className="text-neutral-500">{t("detail.address")}</dt>
                <dd>
                  <p>{location.address}</p>
                  {location.lat != null && location.lng != null ? (
                    <p className="text-xs text-neutral-500">
                      {location.lat}, {location.lng}
                    </p>
                  ) : null}
                  <a
                    href={mapsUrl(location)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-semibold text-[#B439FD]"
                  >
                    {t("maps.directions")}
                    <ExternalLink size={14} />
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.timeline")}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t("detail.timelineHint")}</p>
        <div className="mt-4">
          <RequestTimeline events={timeline} />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.catalogFor", { category: categoryLabel(request.product.category) })}</h2>
        <p className="mt-1 text-xs text-neutral-500">{t("detail.catalogHint")}</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-bold">{t("detail.services")}</p>
            {services.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">{t("common.none")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {services.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>{localizedName(item)}</span>
                    <span className="text-neutral-500">{formatMoney(item.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-bold">{t("detail.parts")}</p>
            {parts.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">{t("common.none")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {parts.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {localizedName(item)}
                      {item.stockQuantity != null ? <span className="text-neutral-400"> · {t("common.inStock", { count: item.stockQuantity })}</span> : null}
                    </span>
                    <span className="text-neutral-500">{formatMoney(item.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {serviceLines.length + partLines.length + extraExpenses.length + photos.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("detail.completion")}</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold">{t("detail.servicesUsed")}</p>
              {serviceLines.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">{t("common.noneYet")}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {serviceLines.map((item) => (
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
              {partLines.length === 0 ? (
                <p className="mt-1 text-sm text-neutral-500">{t("common.noneYet")}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {partLines.map((item) => (
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
          {extraExpenses.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-bold">{t("detail.extras")}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {extraExpenses.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>{item.description}</span>
                    <span className="text-neutral-500">{formatMoney(item.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {photos.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <img key={photo.id} src={photo.photoUrl} alt={t("common.jobPhoto")} className="h-24 w-full rounded-xl object-cover" />
              ))}
            </div>
          ) : null}
          {cost ? (
            <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-extrabold ${cost.coveredByWarranty ? "bg-emerald-50 text-emerald-800" : "bg-[#FFF4E5] text-[#C56A00]"}`}>
              {cost.coveredByWarranty
                ? t("detail.warrantyPays", { amount: formatMoney(cost.chargedTotal) })
                : t("detail.customerPays", { amount: formatMoney(cost.chargedTotal) })}
            </p>
          ) : null}
        </section>
      ) : null}

      {request.pickupConfirmedAt ? (
        <p className="mt-4 text-sm font-bold text-emerald-700">{t("pickup.already")}</p>
      ) : request.status === "ready_for_pickup" || request.status === "completed" || request.status === "closed" ? (
        <div className="mt-4">
          <PickupConfirm pending={pickup.isPending} onConfirm={(signature) => pickup.mutateAsync(signature)} />
        </div>
      ) : null}
    </div>
  );
}
