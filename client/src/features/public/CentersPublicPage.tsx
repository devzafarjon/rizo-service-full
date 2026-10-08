import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { api } from "../../lib/api";
import { mapsUrl } from "../../lib/format";
import { regionLabel } from "../../lib/regions";
import type { ServiceCenter } from "../../lib/types";

/** Where to take a device for service, grouped by region. Public, no sign-in. */
export function CentersPublicPage() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: ["public", "centers"], queryFn: () => api<{ centers: ServiceCenter[] }>("/api/public/centers") });
  const centers = list.data?.centers ?? [];
  const regions = [...new Set(centers.map((center) => center.regionCode))];
  return (
    <BrandChrome action={<Link to="/track" className="btn-rizo-ghost h-11">{t("track.title")}</Link>}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16">
        <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("centers.public.title")}</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-500">{t("centers.public.intro")}</p>
        {list.isLoading ? <Spinner className="mx-auto h-6 w-6" /> : null}
        {!list.isLoading && centers.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-neutral-500">{t("centers.emptyBody")}</p> : null}
        {regions.map((region) => (
          <section key={region} className="mb-5">
            <h2 className="mb-2 text-sm font-extrabold tracking-wide text-[#7B00E0] uppercase">{regionLabel(region)}</h2>
            <ul className="space-y-2">
              {centers
                .filter((center) => center.regionCode === region)
                .map((center) => (
                  <li key={center.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="font-extrabold">{center.name}</p>
                    <p className="mt-1 text-sm text-neutral-600">{center.address}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {center.workingHours ?? ""}
                      {center.phone ? ` · ${center.phone}` : ""}
                    </p>
                    <a href={mapsUrl({ address: center.address, lat: center.lat, lng: center.lng })} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-[#7B00E0] hover:underline">
                      {t("maps.directions")}
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </BrandChrome>
  );
}
