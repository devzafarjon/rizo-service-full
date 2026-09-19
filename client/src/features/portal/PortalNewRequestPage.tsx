import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { WarrantyBadge } from "../../components/Badges";
import { Field } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { LocationType, Named, PortalRequest, PortalSale, ServiceType } from "../../lib/types";
import { portalInputClass, portalTextareaClass } from "./fields";

const TYPES: ServiceType[] = ["repair", "installation"];

export function PortalNewRequestPage() {
  const { t } = useTranslation();
  const { user, token } = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<ServiceType>("repair");
  const [saleId, setSaleId] = useState("");
  const [productId, setProductId] = useState("");
  const [useCatalog, setUseCatalog] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [defectType, setDefectType] = useState<"dead_on_arrival" | "failed_during_use" | "">("");
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

  const create = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<{ request: PortalRequest }>("/api/customer/requests", {
        method: "POST",
        token,
        body: JSON.stringify(values),
      }),
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-2">
          {TYPES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setType(item)}
              className={`rounded-2xl px-4 py-3 text-left ring-1 ${
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
            className={`mb-2 w-full rounded-2xl px-4 py-3 text-left text-sm font-bold ring-1 ${
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
                      <div>
                        <p className="font-bold">{localizedName(sale.product)}</p>
                        <p className="text-xs text-neutral-500">
                          {sale.invoiceNumber} · {formatDate(sale.saleDate)} · {formatMoney(sale.pricePaid)}
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
            className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-bold ring-1 ${
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

        {type === "repair" ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.whatHappened")}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDefectType("failed_during_use")}
                className={`rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                  defectType === "failed_during_use" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                }`}
              >
                {t("defect.failed_during_use")}
              </button>
              <button
                type="button"
                onClick={() => setDefectType("dead_on_arrival")}
                className={`rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                  defectType === "dead_on_arrival" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
                }`}
              >
                {t("defect.dead_on_arrival")}
              </button>
            </div>
          </div>
        ) : null}

        <Field label={t("portal.describeIssue")}>
          <textarea className={portalTextareaClass} value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} required />
        </Field>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-700">{t("portal.where")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLocationType("on_site")}
              className={`rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                locationType === "on_site" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
              }`}
            >
              <MapPin size={16} className="mb-1 inline" /> {t("location.on_site")}
            </button>
            <button
              type="button"
              onClick={() => setLocationType("in_shop")}
              className={`rounded-2xl px-3 py-3 text-sm font-bold ring-1 ${
                locationType === "in_shop" ? "bg-[#F3E8FF] ring-[#B439FD]" : "bg-white ring-neutral-200"
              }`}
            >
              {t("location.in_shop")}
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
        ) : null}

        {selectedSale && !useCatalog ? (
          <p className="text-sm text-neutral-500">
            {selectedSale.warrantyStatus === "in_warranty"
              ? t("portal.warrantyIn", { product: localizedName(selectedSale.product), date: formatDate(selectedSale.warrantyExpiry) })
              : t("portal.warrantyOut", { product: localizedName(selectedSale.product), date: formatDate(selectedSale.warrantyExpiry) })}
          </p>
        ) : null}

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={create.isPending || (!useCatalog && !saleId) || (useCatalog && !productId)}
          className="btn-rizo h-12 w-full text-sm disabled:opacity-50"
        >
          {create.isPending ? <Spinner className="h-4 w-4" /> : null}
          {t("portal.submit")}
        </button>
        <Link to="/portal" className="block text-center text-sm font-semibold text-neutral-500">
          {t("common.cancel")}
        </Link>
      </form>
    </div>
  );
}
