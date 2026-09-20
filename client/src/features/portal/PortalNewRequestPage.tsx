import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MapPin, Navigation, Store, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { Field } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage, apiForm } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import type { LocationType, Named, PortalRequest, PortalSale, ServiceType } from "../../lib/types";
import { portalInputClass, portalTextareaClass } from "./fields";

const TYPES: ServiceType[] = ["repair", "installation"];
const STEPS = 3;

export function PortalNewRequestPage() {
  const { t } = useTranslation();
  const { user, token } = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [type, setType] = useState<ServiceType>("repair");
  const [saleId, setSaleId] = useState("");
  const [productId, setProductId] = useState("");
  const [useCatalog, setUseCatalog] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [defectType, setDefectType] = useState<"dead_on_arrival" | "failed_during_use" | "">("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [locationType, setLocationType] = useState<LocationType>("on_site");
  const [address, setAddress] = useState(user?.address ?? "");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState<string | null>(null);

  const salesQuery = useQuery({
    queryKey: ["customer", "sales"],
    enabled: Boolean(token),
    queryFn: () => api<{ sales: PortalSale[] }>("/api/customer/sales", { token }),
  });
  const productsQuery = useQuery({
    queryKey: ["customer", "products"],
    enabled: Boolean(token && useCatalog),
    queryFn: () => api<{ products: Array<Named & { id: string; sku: string; category: string }> }>("/api/customer/products", { token }),
  });

  const sales = salesQuery.data?.sales ?? [];
  const products = productsQuery.data?.products ?? [];
  const selectedSale = sales.find((item) => item.id === saleId);
  const selectedCatalog = products.find((item) => item.id === productId);
  const selectedProduct = selectedSale?.product ?? selectedCatalog ?? null;
  const previews = useMemo(() => photos.map((file) => ({ file, url: URL.createObjectURL(file) })), [photos]);

  useEffect(() => {
    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [previews]);

  const create = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const data = await api<{ request: PortalRequest }>("/api/customer/requests", {
        method: "POST",
        token,
        body: JSON.stringify(values),
      });
      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((file) => formData.append("photos", file));
        await apiForm(`/api/customer/requests/${data.request.id}/photos`, { token, formData });
      }
      return data;
    },
    onSuccess: async (data) => {
      notify(t("portal.created"));
      await queryClient.invalidateQueries({ queryKey: ["customer"] });
      navigate(`/portal/requests/${data.request.id}`);
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

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

  function canContinue() {
    if (step === 1) return Boolean((!useCatalog && saleId) || (useCatalog && productId));
    if (step === 2) return Boolean(issueDescription.trim());
    if (locationType === "on_site") return Boolean(address.trim());
    return true;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS) {
      if (canContinue()) setStep((current) => current + 1);
      return;
    }
    setError(null);
    const latNumber = lat.trim() === "" ? null : Number(lat);
    const lngNumber = lng.trim() === "" ? null : Number(lng);
    create.mutate({
      type,
      saleId: useCatalog ? null : saleId || null,
      productId: useCatalog ? productId : undefined,
      issueDescription,
      defectType: type === "repair" && defectType ? defectType : null,
      locationType,
      customerLocation:
        locationType === "on_site"
          ? {
              address,
              lat: Number.isFinite(latNumber) ? latNumber : null,
              lng: Number.isFinite(lngNumber) ? lngNumber : null,
            }
          : null,
    });
  }

  if (salesQuery.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("portal.newTitle")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("portal.newIntro")}</p>

      <div className="mt-5">
        <p className="text-xs font-bold tracking-wide text-neutral-400 uppercase">
          {t("common.stepOf", { current: step, total: STEPS })}
        </p>
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: STEPS }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-[#B439FD]" : "bg-neutral-200"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-sm font-semibold text-neutral-700">{t(`portal.step${step}Title`)}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {step === 1 ? (
          <>
            <div className="grid gap-2">
              {TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={`min-h-14 rounded-2xl px-4 py-3 text-left ring-1 ${
                    type === item ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                  }`}
                >
                  <p className="font-extrabold">{t(`type.${item}`)}</p>
                  <p className="text-sm text-neutral-500">{t(`portal.hint.${item}`)}</p>
                </button>
              ))}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.purchase")}</p>
              <button
                type="button"
                onClick={() => {
                  setUseCatalog(false);
                  setProductId("");
                }}
                className={`mb-2 min-h-12 w-full rounded-2xl px-4 py-3 text-left text-sm font-bold ring-1 ${
                  !useCatalog ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                }`}
              >
                {t("portal.selectPurchase")}
              </button>
              {!useCatalog ? (
                sales.length === 0 ? (
                  <p className="mb-2 text-sm text-neutral-500">{t("portal.noPurchases")}</p>
                ) : (
                  <div className="mb-2 space-y-2">
                    {sales.map((sale) => (
                      <button
                        key={sale.id}
                        type="button"
                        onClick={() => setSaleId(sale.id)}
                        className={`w-full rounded-2xl px-4 py-3 text-left ring-1 ${
                          saleId === sale.id ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold">{localizedName(sale.product)}</p>
                            <p className="text-xs text-neutral-500">
                              {sale.invoiceNumber} · {formatDate(sale.saleDate)} · {formatMoney(sale.pricePaid)}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-neutral-500">
                              {t("common.category")}: {categoryLabel(sale.product.category)}
                            </p>
                          </div>
                          <WarrantyBadge status={sale.warrantyStatus} />
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setUseCatalog(true);
                  setSaleId("");
                }}
                className={`min-h-12 w-full rounded-2xl px-4 py-3 text-left text-sm font-bold ring-1 ${
                  useCatalog ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                }`}
              >
                {t("portal.otherProduct")}
              </button>
              {useCatalog ? (
                <select
                  className={`${portalInputClass} mt-2`}
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                >
                  <option value="">{t("portal.selectProduct")}</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {localizedName(product)} · {product.sku}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {selectedProduct ? (
              <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                <p className="text-sm font-bold">{localizedName(selectedProduct)}</p>
                <p className="mt-1 text-xs font-semibold text-neutral-500">
                  {t("common.category")}: {categoryLabel(selectedProduct.category)}
                </p>
                {selectedSale ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <WarrantyBadge status={selectedSale.warrantyStatus} />
                    <p className="text-xs text-neutral-500">
                      {selectedSale.warrantyStatus === "in_warranty"
                        ? t("portal.warrantyIn", { product: localizedName(selectedSale.product), date: formatDate(selectedSale.warrantyExpiry) })
                        : t("portal.warrantyOut", { product: localizedName(selectedSale.product), date: formatDate(selectedSale.warrantyExpiry) })}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">{t("portal.noWarrantyAuto")}</p>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            {type === "repair" ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.whatHappened")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDefectType("failed_during_use")}
                    className={`min-h-14 rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                      defectType === "failed_during_use" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                    }`}
                  >
                    {t("defect.failed_during_use")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefectType("dead_on_arrival")}
                    className={`min-h-14 rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                      defectType === "dead_on_arrival" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                    }`}
                  >
                    {t("defect.dead_on_arrival")}
                  </button>
                </div>
              </div>
            ) : null}

            <Field label={t("portal.describeIssue")}>
              <textarea
                className={portalTextareaClass}
                value={issueDescription}
                onChange={(event) => setIssueDescription(event.target.value)}
                placeholder={t("portal.issuePlaceholder")}
                required
              />
            </Field>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.addPhotos")}</p>
              <p className="mb-3 text-xs text-neutral-500">{t("portal.addPhotosHint")}</p>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-neutral-100 px-4 text-sm font-bold">
                <Camera size={16} />
                {t("common.takePhoto")}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const next = Array.from(event.target.files ?? []);
                    setPhotos((current) => [...current, ...next].slice(0, 8));
                    event.target.value = "";
                  }}
                />
              </label>
              {previews.length > 0 ? (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {previews.map((item, index) => (
                    <li key={item.url} className="relative">
                      <img src={item.url} alt="" className="h-24 w-full rounded-xl object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                        className="absolute top-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-neutral-700"
                        aria-label={t("common.removePhoto")}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.where")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLocationType("on_site")}
                  className={`min-h-14 rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                    locationType === "on_site" ? "bg-[#FFF4E5] ring-[#F6921E]" : "bg-white ring-neutral-200"
                  }`}
                >
                  <MapPin size={16} className="mb-1 inline" /> {t("location.on_site")}
                </button>
                <button
                  type="button"
                  onClick={() => setLocationType("in_shop")}
                  className={`min-h-14 rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                    locationType === "in_shop" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                  }`}
                >
                  <Store size={16} className="mb-1 inline" /> {t("location.in_shop")}
                </button>
              </div>
            </div>

            {locationType === "on_site" ? (
              <div className="space-y-3">
                <Field label={t("common.address")}>
                  <input className={portalInputClass} value={address} onChange={(event) => setAddress(event.target.value)} required />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {user?.address ? (
                    <button
                      type="button"
                      onClick={() => setAddress(user.address ?? "")}
                      className="inline-flex min-h-11 items-center rounded-xl bg-neutral-100 px-3 text-sm font-bold"
                    >
                      {t("portal.useMyAddress")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={captureCoords}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-sm font-bold"
                  >
                    <Navigation size={16} />
                    {t("portal.useCurrentLocation")}
                  </button>
                </div>
                {lat && lng ? (
                  <p className="text-xs font-semibold text-neutral-500">
                    {lat}, {lng}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">{t("portal.inShopReview")}</p>
            )}

            <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm">
              <p className="font-extrabold">{t("portal.review")}</p>
              <p className="mt-2 text-neutral-600">
                {t(`type.${type}`)}
                {selectedProduct ? ` · ${localizedName(selectedProduct)}` : ""}
              </p>
              {selectedSale ? <div className="mt-2"><WarrantyBadge status={selectedSale.warrantyStatus} /></div> : null}
              <p className="mt-2 line-clamp-3 text-neutral-600">{issueDescription}</p>
              {photos.length > 0 ? <p className="mt-2 text-xs font-semibold text-neutral-500">{t("portal.photoCount", { count: photos.length })}</p> : null}
            </div>
          </>
        ) : null}

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <div className="sticky bottom-20 z-20 -mx-4 mt-5 flex gap-2 border-t border-neutral-100 bg-white px-4 py-3 sm:static sm:bottom-auto sm:mx-0 sm:border-0 sm:px-0 sm:py-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold"
            >
              {t("common.back")}
            </button>
          ) : (
            <Link to="/portal" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold text-neutral-600">
              {t("common.cancel")}
            </Link>
          )}
          <button
            type="submit"
            disabled={create.isPending || !canContinue()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#B439FD] text-sm font-extrabold text-white disabled:opacity-50"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : null}
            {step < STEPS ? t("common.next") : t("portal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
