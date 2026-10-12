import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PageSkeleton } from "../../components/PageSkeleton";
import { StatCard } from "../../components/StatCard";
import { segmentedItemClass, segmentedScrollClass } from "../../components/segmented";
import { inputClass } from "../../components/Field";
import { api } from "../../lib/api";
import { regionLabel } from "../../lib/regions";
import type { Warehouse } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { HistoryTab } from "./HistoryTab";
import { ListTab } from "./ListTab";
import { RestockTab } from "./RestockTab";
import { StockTab } from "./StockTab";
import { TransfersTab } from "./TransfersTab";

type Mine = { warehouseId: string; canManageAll: boolean; manages: boolean };
type Tab = "requests" | "incoming" | "stock" | "restock" | "history" | "list";

/**
 * Warehouses: the keeper's workplace. Requests from technicians and branch admins to send, parts on the way in, the shelf with
 * counts and minimums, restocking from the quickest source, the history, and (admin) the list of all warehouses.
 */
export function WarehousesPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = user?.role === "admin";

  const all = useQuery({
    queryKey: ["staff", "warehouses", "list"],
    enabled: Boolean(token),
    refetchInterval: 60_000,
    queryFn: () => api<{ warehouses: Warehouse[] }>("/api/staff/warehouses", { token }),
  });
  const mine = useQuery({ queryKey: ["staff", "warehouses", "mine"], enabled: Boolean(token), queryFn: () => api<Mine>("/api/staff/warehouses/mine", { token }) });

  const warehouses = all.data?.warehouses ?? [];
  const locked = mine.data && !mine.data.canManageAll && user?.role === "warehouse";
  const visible = locked ? warehouses.filter((row) => row.id === mine.data!.warehouseId) : warehouses.filter((row) => row.isActive || isAdmin);
  const requested = params.get("w");
  const selectedId = visible.find((row) => row.id === requested)?.id ?? (mine.data && visible.find((row) => row.id === mine.data.warehouseId)?.id) ?? visible[0]?.id ?? "";
  const selected = visible.find((row) => row.id === selectedId);

  const manages = Boolean(mine.data?.manages) && (mine.data?.canManageAll || mine.data?.warehouseId === selectedId);
  const canReceive = manages || mine.data?.warehouseId === selectedId;
  const canAsk = user?.role !== "accountant";

  const tabs: Tab[] = ["requests", "incoming", "stock", "restock", "history", ...(isAdmin ? (["list"] as const) : [])];
  const requestedTab = params.get("tab");
  const tab: Tab = (tabs as string[]).includes(requestedTab ?? "") ? (requestedTab as Tab) : "requests";
  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (selectedId && requested !== selectedId && !locked && params.get("w")) setQuery({ w: selectedId });
  }, [selectedId]);

  if (all.isLoading || mine.isLoading) return <PageSkeleton />;
  const counts: Partial<Record<Tab, number>> = { requests: selected?.toSend, incoming: selected?.arriving, restock: selected?.low };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("warehouse.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("warehouse.intro")}</p>
        </div>
        {visible.length > 1 ? (
          <select className={`${inputClass} bg-white sm:max-w-xs`} value={selectedId} onChange={(event) => setQuery({ w: event.target.value })} aria-label={t("warehouse.choose")}>
            {visible.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {regionLabel(row.regionCode)}
                {row.isActive ? "" : ` (${t("warehouse.off")})`}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {selected ? (
        <>
          <p className="mb-3 text-sm text-neutral-600">
            {t(`warehouse.kind.${selected.kind}`)} · {regionLabel(selected.regionCode)}
            {selected.serviceCenterName ? ` · ${selected.serviceCenterName}` : ""}
            {selected.keepers.length ? ` · ${t("warehouse.keepers")}: ${selected.keepers.map((keeper) => keeper.name).join(", ")}` : ""}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t("warehouse.stat.units")} value={String(selected.units)} footer={t("warehouse.stat.parts", { count: selected.parts })} />
            <button type="button" className="text-left" onClick={() => setQuery({ tab: "requests" })}>
              <StatCard label={t("warehouse.stat.toSend")} value={String(selected.toSend)} accent={selected.toSend > 0 ? "orange" : "green"} />
            </button>
            <button type="button" className="text-left" onClick={() => setQuery({ tab: "incoming" })}>
              <StatCard label={t("warehouse.stat.arriving")} value={String(selected.arriving)} accent="purple" />
            </button>
            <button type="button" className="text-left" onClick={() => setQuery({ tab: "restock" })}>
              <StatCard label={t("warehouse.stat.low")} value={String(selected.low)} accent={selected.low > 0 ? "red" : "green"} />
            </button>
          </div>
        </>
      ) : null}

      <div className={`${segmentedScrollClass} mb-4`}>
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setQuery({ tab: item === "requests" ? null : item })} className={segmentedItemClass(tab === item)}>
            {t(`warehouse.tab.${item}`)}
            {counts[item] ? <span className={`ml-2 rounded-full px-1.5 text-[11px] font-extrabold ${tab === item ? "bg-white/25" : "bg-[#F5EBFD] text-[#5A0085]"}`}>{counts[item]}</span> : null}
          </button>
        ))}
      </div>

      {tab === "list" ? <ListTab warehouses={warehouses} onOpen={(id) => setQuery({ w: id, tab: null })} /> : null}
      {selectedId && tab === "requests" ? <TransfersTab key={`out-${selectedId}`} warehouseId={selectedId} direction="out" canAct={manages} canReceive={canReceive} /> : null}
      {selectedId && tab === "incoming" ? <TransfersTab key={`in-${selectedId}`} warehouseId={selectedId} direction="in" canAct={manages} canReceive={canReceive} /> : null}
      {selectedId && tab === "stock" ? <StockTab warehouseId={selectedId} canAct={manages} canAsk={canAsk} /> : null}
      {selectedId && tab === "restock" ? <RestockTab warehouseId={selectedId} canAct={manages} /> : null}
      {selectedId && tab === "history" ? <HistoryTab warehouseId={selectedId} /> : null}
    </div>
  );
}
