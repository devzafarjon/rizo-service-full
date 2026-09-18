import { useQuery } from "@tanstack/react-query";
import { Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { StatusBadge, TypeBadge, WarrantyBadge } from "../../components/Badges";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDateTime, formatMoney, formatPhone, formatRequestId } from "../../lib/format";
import { localizedName, nameSearchText } from "../../lib/localized";
import type { ServiceRequest } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";

const DONE_STATUSES = new Set(["completed", "closed", "replaced"]);

export function ReceiptPage() {
  const { t, i18n } = useTranslation();
  const { token } = useStaffAuth();
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 250);

  const list = useQuery({
    queryKey: ["staff", "requests", "receipts"],
    enabled: Boolean(token),
    queryFn: () => api<{ requests: ServiceRequest[] }>("/api/staff/requests", { token }),
  });

  const receipts = useMemo(() => {
    const rows = (list.data?.requests ?? []).filter(
      (request) => DONE_STATUSES.has(request.status) || request.completedAt,
    );
    const needle = debounced.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((request) => {
          const hay = [
            request.displayId,
            formatRequestId(request.displayId),
            request.id,
            request.customer.name,
            request.customer.phone,
            request.product.name,
            localizedName(request.product),
            nameSearchText(request.product),
            request.assignedTechnician?.name ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : rows;
    return [...filtered].sort((a, b) => {
      const aDate = a.completedAt ?? a.createdAt;
      const bDate = b.completedAt ?? b.createdAt;
      return bDate.localeCompare(aDate);
    });
  }, [list.data?.requests, debounced, i18n.language]);

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("receipt.title")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("receipt.intro")}</p>
      </div>

      <div className="relative mb-4 min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          className={`${inputClass} pl-10`}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("receipt.searchPlaceholder")}
        />
      </div>

      {receipts.length === 0 ? (
        <EmptyState
          title={t("receipt.emptyTitle")}
          body={t("receipt.emptyBody")}
          action={
            <Link to="/app/requests" className="inline-flex h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
              {t("receipt.openRequests")}
            </Link>
          }
        />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("common.requestId")}</Th>
              <Th>{t("common.customer")}</Th>
              <Th>{t("common.product")}</Th>
              <Th>{t("common.type")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.warranty")}</Th>
              <Th>{t("common.total")}</Th>
              <Th>{t("common.completed")}</Th>
              <Th>{t("common.print")}</Th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((request) => (
              <tr key={request.id} className="border-b border-neutral-100 last:border-0">
                <Td className="font-mono text-xs font-semibold">{formatRequestId(request.displayId)}</Td>
                <Td>
                  <p className="font-semibold">{request.customer.name}</p>
                  <p className="text-xs text-neutral-500">{formatPhone(request.customer.phone)}</p>
                </Td>
                <Td>{localizedName(request.product)}</Td>
                <Td>
                  <TypeBadge type={request.type} />
                </Td>
                <Td>
                  <StatusBadge status={request.status} />
                </Td>
                <Td>
                  <WarrantyBadge status={request.warrantyStatus} />
                </Td>
                <Td className="font-semibold">
                  {request.warrantyStatus === "in_warranty" ? formatMoney(0) : formatMoney(request.finalCost ?? 0)}
                </Td>
                <Td>{formatDateTime(request.completedAt ?? request.createdAt)}</Td>
                <Td>
                  <Link
                    to={`/app/receipts/${request.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F3E8FF] px-3 text-sm font-bold text-[#B439FD]"
                  >
                    <Printer size={14} />
                    {t("receipt.print")}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
    </div>
  );
}
