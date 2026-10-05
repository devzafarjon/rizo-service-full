import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatRequestId, mapsUrl } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { statusLabel, isTerminalStatus } from "../../lib/status";
import type { ServiceRequest } from "../../lib/types";

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function pin(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Open on-site jobs on a map (OpenStreetMap). A job appears once its location has coordinates. */
export function MapPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const list = useQuery({
    queryKey: ["staff", "requests", "map"],
    enabled: Boolean(token),
    refetchInterval: 60_000,
    queryFn: () => api<{ requests: ServiceRequest[] }>("/api/staff/requests?locationType=on_site", { token }),
  });
  const jobs = (list.data?.requests ?? []).filter((request) => !isTerminalStatus(request.status) && request.customerLocation?.lat != null && request.customerLocation?.lng != null);
  const missing = (list.data?.requests ?? []).filter((request) => !isTerminalStatus(request.status) && request.customerLocation && (request.customerLocation.lat == null || request.customerLocation.lng == null));

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = L.map(host.current).setView([41.3111, 69.2797], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const bounds: L.LatLngTuple[] = [];
    for (const request of jobs) {
      const lat = request.customerLocation!.lat!;
      const lng = request.customerLocation!.lng!;
      bounds.push([lat, lng]);
      const color = request.isOverdue ? "#DC2626" : request.assignedTechnician ? "#7B00E0" : "#F7941E";
      L.marker([lat, lng], { icon: pin(color) })
        .bindPopup(
          `<strong>${esc(request.customer.name)}</strong><br/>${esc(formatRequestId(request.displayId))} · ${esc(localizedName(request.product))}<br/>${esc(statusLabel(request.status))} · ${esc(request.assignedTechnician?.name ?? t("common.unassigned"))}<br/><a href="/app/kanban?request=${encodeURIComponent(request.id)}">${esc(t("map.open"))}</a> · <a href="${esc(mapsUrl(request.customerLocation!))}" target="_blank" rel="noreferrer">${esc(t("maps.directions"))}</a>`,
        )
        .addTo(layer);
    }
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("map.title")}</h1>
      <p className="mt-1 mb-3 text-sm text-neutral-500">{t("map.intro")}</p>
      <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold text-neutral-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#7B00E0]" />{t("map.assigned")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#F7941E]" />{t("map.unassigned")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-600" />{t("kanban.overdue")}</span>
        <span>{list.isLoading ? t("common.loading") : t("map.count", { count: jobs.length })}</span>
      </div>
      <div ref={host} className="h-[60vh] min-h-80 w-full overflow-hidden rounded-2xl border border-neutral-200" />
      {missing.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-bold text-amber-900">{t("map.noCoords", { count: missing.length })}</p>
          <ul className="mt-2 space-y-1">
            {missing.map((request) => (
              <li key={request.id}>
                <Link to={`/app/requests/${request.id}`} className="font-mono text-xs font-bold text-[#7B00E0] hover:underline">
                  {formatRequestId(request.displayId)}
                </Link>{" "}
                <span className="text-neutral-700">{request.customerLocation?.address}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
