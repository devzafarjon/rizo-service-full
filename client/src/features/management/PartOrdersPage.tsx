import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { StatCard } from "../../components/StatCard";
import { segmentedScrollClass, segmentedItemClass } from "../../components/segmented";
import { api } from "../../lib/api";
import type { PartsOverview } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { emptyOrder, OrderFormModal, type OrderDraft } from "./parts/OrderFormModal";
import { OrdersTab } from "./parts/OrdersTab";
import { RecommendationsTab } from "./parts/RecommendationsTab";
import { SuppliersTab } from "./parts/SuppliersTab";
import { WaitingTab } from "./parts/WaitingTab";

const TABS = ["recommend", "waiting", "orders", "suppliers"] as const;
type Tab = (typeof TABS)[number];

/** Spare-part control: jobs waiting for parts, what to order next, orders and deliveries, suppliers. */
export function PartOrdersPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "waiting";
  const [draft, setDraft] = useState<OrderDraft | null>(null);

  const overview = useQuery({
    queryKey: ["staff", "part-orders", "overview"],
    enabled: Boolean(token),
    refetchInterval: 60_000,
    queryFn: () => api<{ overview: PartsOverview }>("/api/staff/part-orders/overview", { token }),
  });
  const stats = overview.data?.overview;
  const go = (next: Tab) => setParams(next === "waiting" ? {} : { tab: next }, { replace: true });
  const counts: Partial<Record<Tab, number>> = { recommend: stats?.toOrder, waiting: stats?.waitingRequests, orders: stats?.openOrders };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("parts.ordersTitle")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("parts.ordersIntro")}</p>
        </div>
        <button type="button" onClick={() => setDraft(emptyOrder)} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("parts.newOrder")}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => go("waiting")} className="text-left">
          <StatCard label={t("parts.stat.waiting")} value={String(stats?.waitingRequests ?? "–")} accent="orange" />
        </button>
        <button type="button" onClick={() => go("waiting")} className="text-left">
          <StatCard label={t("parts.stat.noOrder")} value={String(stats?.noOrder ?? "–")} accent={stats && stats.noOrder > 0 ? "red" : "green"} />
        </button>
        <button type="button" onClick={() => go("orders")} className="text-left">
          <StatCard label={t("parts.stat.late")} value={String(stats?.lateOrders ?? "–")} accent={stats && stats.lateOrders > 0 ? "red" : "green"} />
        </button>
        <button type="button" onClick={() => go("recommend")} className="text-left">
          <StatCard label={t("parts.stat.toOrder")} value={String(stats?.toOrder ?? "–")} accent={stats && stats.toOrder > 0 ? "orange" : "green"} />
        </button>
      </div>

      <div className={`${segmentedScrollClass} mb-4`}>
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => go(item)} className={segmentedItemClass(tab === item)}>
            {t(`parts.tab.${item}`)}
            {counts[item] ? <span className={`ml-2 rounded-full px-1.5 text-[11px] font-extrabold ${tab === item ? "bg-white/25" : "bg-[#F5EBFD] text-[#5A0085]"}`}>{counts[item]}</span> : null}
          </button>
        ))}
      </div>

      {tab === "recommend" ? <RecommendationsTab /> : null}
      {tab === "waiting" ? <WaitingTab onOrder={setDraft} /> : null}
      {tab === "orders" ? <OrdersTab /> : null}
      {tab === "suppliers" ? <SuppliersTab /> : null}

      <OrderFormModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
