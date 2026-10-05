import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { InfoTip } from "../../components/InfoTip";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { ApiError, api, apiErrorMessage } from "../../lib/api";
import { SignaturePad } from "../../components/SignaturePad";
import { formatMoney, formatPhone, formatRequestId, technicianTypeLabel } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import type {
  CatalogService,
  LocationType,
  Priority,
  Product,
  Sale,
  ServiceCenter,
  ServiceRequest,
  ServiceType,
  SparePart,
  StaffCustomer,
  TechnicianSummary,
  TechnicianType,
} from "../../lib/types";

const TYPES: ServiceType[] = ["installation", "repair"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
const ASSIGNMENT_MODES = ["auto", "manual", "unassigned"] as const;
const INTAKE_ITEMS = ["powers_on", "screen_ok", "body_scratches", "accessories_included", "original_packaging", "water_damage_signs"];

type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export function NewRequestPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefillCustomerId = params.get("customerId") ?? "";
  const prefillSaleId = params.get("saleId") ?? "";

  const [type, setType] = useState<ServiceType>("repair");
  const [customerId, setCustomerId] = useState(prefillCustomerId);
  const [saleId, setSaleId] = useState(prefillSaleId);
  const [productId, setProductId] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [defectType, setDefectType] = useState<"dead_on_arrival" | "failed_during_use" | "">("");
  const [locationType, setLocationType] = useState<LocationType>("in_shop");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [technicianTypeRequired, setTechnicianTypeRequired] = useState<TechnicianType>("service_center");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("auto");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [source, setSource] = useState<"rizo_service" | "rizo_market">("rizo_service");
  const [serialNumber, setSerialNumber] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [serviceCenterId, setServiceCenterId] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [intakeNotes, setIntakeNotes] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; displayId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["staff", "customers"],
    enabled: Boolean(token),
    queryFn: () => api<{ customers: StaffCustomer[] }>("/api/staff/customers", { token }),
  });
  const productsQuery = useQuery({
    queryKey: ["staff", "products"],
    enabled: Boolean(token),
    queryFn: () => api<{ products: Product[] }>("/api/staff/products", { token }),
  });
  const salesQuery = useQuery({
    queryKey: ["staff", "sales", "customer", customerId],
    enabled: Boolean(token && customerId),
    queryFn: () => api<{ sales: Sale[] }>(`/api/staff/sales?customerId=${encodeURIComponent(customerId)}`, { token }),
  });
  const prefillSale = useQuery({
    queryKey: ["staff", "sales", prefillSaleId],
    enabled: Boolean(token && prefillSaleId),
    queryFn: () => api<{ sale: Sale }>(`/api/staff/sales/${prefillSaleId}`, { token }),
  });
  const techniciansQuery = useQuery({
    queryKey: ["staff", "technicians"],
    enabled: Boolean(token),
    queryFn: () => api<{ technicians: TechnicianSummary[] }>("/api/staff/technicians", { token }),
  });
  const centersQuery = useQuery({
    queryKey: ["staff", "service-centers"],
    enabled: Boolean(token),
    queryFn: () => api<{ centers: ServiceCenter[] }>("/api/staff/service-centers", { token }),
  });

  const customers = customersQuery.data?.customers ?? [];
  const products = productsQuery.data?.products ?? [];
  const sales = salesQuery.data?.sales ?? [];
  const technicians = techniciansQuery.data?.technicians ?? [];
  const customer = customers.find((item) => item.id === customerId);
  const selectedSale = sales.find((item) => item.id === saleId) ?? prefillSale.data?.sale;
  const product = products.find((item) => item.id === productId) ?? selectedSale?.product;
  const category = product?.category ?? "";

  const servicesQuery = useQuery({
    queryKey: ["staff", "services", "category", category],
    enabled: Boolean(token && category),
    queryFn: () => api<{ services: CatalogService[] }>(`/api/staff/catalog/services?category=${encodeURIComponent(category)}`, { token }),
  });
  const partsQuery = useQuery({
    queryKey: ["staff", "parts", "category", category],
    enabled: Boolean(token && category),
    queryFn: () => api<{ parts: SparePart[] }>(`/api/staff/catalog/parts?category=${encodeURIComponent(category)}`, { token }),
  });

  useEffect(() => {
    const sale = prefillSale.data?.sale;
    if (!sale) return;
    setCustomerId(sale.customerId);
    setSaleId(sale.id);
    setProductId(sale.productId);
  }, [prefillSale.data]);

  useEffect(() => {
    if (selectedSale) {
      setProductId(selectedSale.productId);
      if (selectedSale.serialNumber) setSerialNumber(selectedSale.serialNumber);
    }
  }, [selectedSale]);

  const matchingTechs = useMemo(
    () => technicians.filter((tech) => tech.technicianType === technicianTypeRequired),
    [technicians, technicianTypeRequired],
  );
  const autoPick = matchingTechs.find((tech) => tech.isAvailable) ?? null;

  const create = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<{ request: ServiceRequest; repeat: { displayId: string; free: boolean } | null; assignment: { mode: string; note: string; technicianName?: string | null } }>(
        "/api/staff/requests",
        {
          method: "POST",
          token,
          body: JSON.stringify(values),
        },
      ),
    onSuccess: (data) => {
      const name = data.assignment.technicianName;
      if (data.assignment.mode === "auto" && name) {
        notify(t("newRequest.assignedAuto", { name }));
      } else if (data.assignment.mode === "manual" && name) {
        notify(t("newRequest.assignedManual", { name }));
      } else {
        notify(t("newRequest.savedUnassigned"));
      }
      if (data.repeat) notify(data.repeat.free ? t("newRequest.repeatFree", { id: data.repeat.displayId }) : t("newRequest.repeatFound", { id: data.repeat.displayId }));
      navigate(`/app/requests/${data.request.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "duplicateRequest" && err.details) {
        setDuplicate({ id: String(err.details.id), displayId: String(err.details.displayId) });
        setError(null);
        return;
      }
      setError(apiErrorMessage(err, t));
    },
  });

  function chooseLocation(next: LocationType) {
    setLocationType(next);
    setTechnicianTypeRequired(next === "on_site" ? "mobile" : "service_center");
    setAssignedTechnicianId("");
  }

  function chooseType(next: ServiceType) {
    setType(next);
    // Installation is always done at the customer's address.
    if (next === "installation") {
      chooseLocation("on_site");
      if (!address.trim() && customer?.address) {
        setAddress(customer.address);
      }
    }
  }

  function useCustomerAddress() {
    if (customer?.address) {
      setAddress(customer.address);
    }
  }

  function captureCoords() {
    if (!navigator.geolocation) {
      notify(t("common.geoUnavailable"), "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLng(position.coords.longitude.toFixed(6));
      },
      () => notify(t("common.geoFailed"), "error"),
    );
  }

  function handleSubmit(event: FormEvent, allowDuplicate = false) {
    event.preventDefault();
    setError(null);
    setDuplicate(null);
    const latNumber = lat.trim() === "" ? null : Number(lat);
    const lngNumber = lng.trim() === "" ? null : Number(lng);
    create.mutate({
      type,
      customerId,
      saleId: saleId || null,
      productId,
      issueDescription,
      defectType: type === "repair" && defectType ? defectType : null,
      locationType: type === "installation" ? "on_site" : locationType,
      customerLocation:
        type === "installation" || locationType === "on_site"
          ? {
              address,
              lat: Number.isFinite(latNumber) ? latNumber : null,
              lng: Number.isFinite(lngNumber) ? lngNumber : null,
            }
          : null,
      technicianTypeRequired,
      autoAssign: assignmentMode === "auto",
      assignedTechnicianId: assignmentMode === "manual" ? assignedTechnicianId : null,
      priority,
      source,
      serialNumber: serialNumber.trim() || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      serviceCenterId: locationType === "in_shop" && type === "repair" && serviceCenterId ? serviceCenterId : null,
      allowDuplicate,
      intake:
        type === "repair" && locationType === "in_shop" && (checklist.length > 0 || intakeNotes.trim() || signature)
          ? { checklist, notes: intakeNotes.trim() || null, signatureDataUrl: signature }
          : null,
    });
  }

  if (customersQuery.isLoading || productsQuery.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <Link to="/app/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-[#7B00E0]">
        <ArrowLeft size={16} />
        {t("common.allRequests")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("newRequest.title")}</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">{t("newRequest.intro")}</p>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-neutral-700">{t("newRequest.type")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => chooseType(item)}
                  className={`rounded-2xl border px-3 py-3 text-left ${
                    type === item ? "border-[#7B00E0] bg-[#F5EBFD]" : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <p className="text-sm font-bold">{t(`type.${item}`)}</p>
                  <p className="mt-1 text-xs text-neutral-500">{t(`newRequest.hint.${item}`)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
            <Field label={t("newRequest.customer")}>
              <select
                className={inputClass}
                value={customerId}
                required
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setSaleId("");
                  if (!prefillSaleId) setProductId("");
                }}
              >
                <option value="">{t("newRequest.selectCustomer")}</option>
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatPhone(item.phone)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("newRequest.sale")} hint={t("newRequest.saleHint")}>
              <select
                className={inputClass}
                value={saleId}
                disabled={!customerId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSaleId(next);
                  if (!next) setProductId("");
                }}
              >
                <option value="">{t("newRequest.noSale")}</option>
                {sales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.invoiceNumber} · {localizedName(sale.product)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("newRequest.product")}>
              <select className={inputClass} value={productId} required disabled={Boolean(saleId)} onChange={(event) => setProductId(event.target.value)}>
                <option value="">{t("newRequest.selectProduct")}</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {localizedName(item)} ({item.sku})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("newRequest.priority")}>
              <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {t(`priority.${item}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("newRequest.issue")} hint={t("newRequest.issueHint")}>
              <textarea className={textareaClass} value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} required />
            </Field>
            <div className="space-y-4">
              {type === "repair" ? (
                <Field label={t("newRequest.defect")}>
                  <select className={inputClass} value={defectType} onChange={(event) => setDefectType(event.target.value as typeof defectType)}>
                    <option value="">{t("defect.unspecified")}</option>
                    <option value="dead_on_arrival">{t("defect.dead_on_arrival")}</option>
                    <option value="failed_during_use">{t("defect.failed_during_use")}</option>
                  </select>
                </Field>
              ) : null}
              <Field label={t("newRequest.source")}>
                <select className={inputClass} value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
                  <option value="rizo_service">{t("source.rizo_service")}</option>
                  <option value="rizo_market">{t("source.rizo_market")}</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-neutral-700">{t("newRequest.location")}</p>
            {type === "installation" ? (
              <p className="mb-3 text-sm text-neutral-500">{t("newRequest.installationOnlyOnSite")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseLocation("in_shop")}
                  className={`rounded-2xl border px-3 py-3 text-left ${
                    locationType === "in_shop" ? "border-[#7B00E0] bg-[#F5EBFD]" : "border-neutral-200"
                  }`}
                >
                  <p className="text-sm font-bold">{t("location.in_shop")}</p>
                  <p className="mt-1 text-xs text-neutral-500">{t("location.inShopHint")}</p>
                </button>
                <button
                  type="button"
                  onClick={() => chooseLocation("on_site")}
                  className={`rounded-2xl border px-3 py-3 text-left ${
                    locationType === "on_site" ? "border-[#F7941E] bg-[#FFF4E5]" : "border-neutral-200"
                  }`}
                >
                  <p className="text-sm font-bold">{t("location.on_site")}</p>
                  <p className="mt-1 text-xs text-neutral-500">{t("location.onSiteHint")}</p>
                </button>
              </div>
            )}
            {type === "installation" || locationType === "on_site" ? (
              <div className="mt-4 space-y-3">
                <Field label={t("newRequest.address")}>
                  <textarea className={textareaClass} value={address} onChange={(event) => setAddress(event.target.value)} required placeholder={t("newRequest.addressPlaceholder")} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={useCustomerAddress} className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-semibold">
                    <MapPin size={14} />
                    {t("newRequest.useProfileAddress")}
                  </button>
                  <button type="button" onClick={captureCoords} className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-semibold">
                    <Navigation size={14} />
                    {t("newRequest.useCoords")}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("newRequest.lat")}>
                    <input className={inputClass} value={lat} onChange={(event) => setLat(event.target.value)} />
                  </Field>
                  <Field label={t("newRequest.lng")}>
                    <input className={inputClass} value={lng} onChange={(event) => setLng(event.target.value)} />
                  </Field>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-3 flex items-center gap-1 text-sm font-semibold text-neutral-700">
              {t("common.technician")}
              <InfoTip text={t("newRequest.assignAutoTip")} />
            </p>
            <Field label={t("newRequest.technicianType")}>
              <select
                className={inputClass}
                value={technicianTypeRequired}
                onChange={(event) => {
                  setTechnicianTypeRequired(event.target.value as TechnicianType);
                  setAssignedTechnicianId("");
                }}
              >
                <option value="service_center">{t("techType.service_center")}</option>
                <option value="mobile">{t("techType.mobile")}</option>
              </select>
            </Field>
            <div className="mt-4 grid gap-2">
              {ASSIGNMENT_MODES.map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-semibold">
                  <input type="radio" name="assignment" checked={assignmentMode === value} onChange={() => setAssignmentMode(value)} />
                  {t(`newRequest.assign.${value}`)}
                </label>
              ))}
            </div>
            {assignmentMode === "auto" ? (
              <p className="mt-3 text-sm text-neutral-600">
                {autoPick
                  ? t("newRequest.willAssign", { name: autoPick.name, jobs: t("kanban.openJobs", { count: autoPick.openJobCount }) })
                  : t("newRequest.noTechAvailable")}
              </p>
            ) : null}
            {assignmentMode === "manual" ? (
              <Field label={t("common.technician")}>
                <select className={inputClass} required value={assignedTechnicianId} onChange={(event) => setAssignedTechnicianId(event.target.value)}>
                  <option value="">{t("newRequest.selectTechnician")}</option>
                  {matchingTechs.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} · {technicianTypeLabel(tech.technicianType)} · {tech.isAvailable ? t("kanban.openJobs", { count: tech.openJobCount }) : t("shell.busy")}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </section>

          <section className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-2">
            <Field label={t("serial.label")} hint={t("serial.hint")}>
              <input className={inputClass} value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} maxLength={80} />
            </Field>
            <Field label={locationType === "on_site" || type === "installation" ? t("newRequest.visitTime") : t("newRequest.appointment")} hint={t("newRequest.visitTimeHint")}>
              <input className={inputClass} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </Field>
            {locationType === "in_shop" && type === "repair" ? (
              <Field label={t("centers.center")} hint={t("centers.pickHint")}>
                <select className={`${inputClass} bg-white`} value={serviceCenterId} onChange={(event) => setServiceCenterId(event.target.value)}>
                  <option value="">{t("centers.auto")}</option>
                  {(centersQuery.data?.centers ?? [])
                    .filter((center) => center.isActive)
                    .map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                </select>
              </Field>
            ) : null}
          </section>

          {type === "repair" && locationType === "in_shop" ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-semibold text-neutral-700">{t("intake.title")}</p>
              <p className="mt-1 text-xs text-neutral-500">{t("intake.hint")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {INTAKE_ITEMS.map((item) => {
                  const on = checklist.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChecklist(on ? checklist.filter((entry) => entry !== item) : [...checklist, item])}
                      className={`h-10 rounded-full px-4 text-sm font-bold ${on ? "bg-[#7B00E0] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                    >
                      {t(`intake.items.${item}`)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                <Field label={t("intake.notes")}>
                  <textarea className={textareaClass} value={intakeNotes} onChange={(event) => setIntakeNotes(event.target.value)} maxLength={1000} placeholder={t("intake.notesPlaceholder")} />
                </Field>
              </div>
              <div className="mt-4">
                <p className="mb-1.5 text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("intake.signature")}</p>
                <SignaturePad value={signature} onChange={setSignature} disabled={create.isPending} />
              </div>
            </section>
          ) : null}

          {duplicate ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">{t("newRequest.duplicateTitle")}</p>
              <p className="mt-1">
                {t("newRequest.duplicateBody", { id: formatRequestId(duplicate.displayId) })}{" "}
                <Link to={`/app/requests/${duplicate.id}`} className="font-bold underline">
                  {t("newRequest.openExisting")}
                </Link>
              </p>
              <button type="button" onClick={(event) => handleSubmit(event as unknown as FormEvent, true)} className="mt-3 h-10 rounded-lg bg-amber-600 px-4 text-sm font-bold text-white">
                {t("newRequest.createAnyway")}
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#7B00E0] px-4 text-sm font-bold text-white hover:bg-[#6500BD] disabled:opacity-70 sm:w-auto"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("newRequest.submit")}
          </button>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("newRequest.warrantyCheck")}</p>
            {selectedSale ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold">{selectedSale.invoiceNumber}</p>
                <WarrantyBadge status={selectedSale.warrantyStatus} />
                <p className="text-xs text-neutral-500">{t("newRequest.expiresOn", { date: selectedSale.warrantyExpiry })}</p>
                <p className="text-xs text-neutral-500">
                  {type === "repair" && selectedSale.warrantyStatus !== "in_warranty"
                    ? t("newRequest.paidRepairNote")
                    : selectedSale.warrantyStatus === "in_warranty"
                      ? t("newRequest.coveredNote")
                      : t("newRequest.noWarrantyNote")}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">{t("newRequest.noSaleNote")}</p>
            )}
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("newRequest.matchingCatalog")}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {category ? t("newRequest.filteredTo", { category: categoryLabel(category) }) : t("newRequest.selectProductFilter")}
            </p>
            {category ? (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-sm font-bold">{t("catalog.services")}</p>
                  {(servicesQuery.data?.services ?? []).length === 0 ? (
                    <p className="text-xs text-neutral-500">{t("newRequest.noServices")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {(servicesQuery.data?.services ?? []).map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span>{localizedName(item)}</span>
                          <span className="text-neutral-500">{formatMoney(item.price)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold">{t("catalog.parts")}</p>
                  {(partsQuery.data?.parts ?? []).length === 0 ? (
                    <p className="text-xs text-neutral-500">{t("newRequest.noParts")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm">
                      {(partsQuery.data?.parts ?? []).map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span>{localizedName(item)}</span>
                          <span className="text-neutral-500">{formatMoney(item.price)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </form>
    </div>
  );
}
