import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { WarehouseMovement } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";

/** Every movement on this shelf: receipts, sends, counts, parts used on jobs, parts given to technicians. */
export function HistoryTab({ warehouseId }: { warehouseId: string }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const list = useQuery({
    queryKey: ["staff", "warehouses", warehouseId, "movements"],
    enabled: Boolean(token) && Boolean(warehouseId),
    queryFn: () => api<{ movements: WarehouseMovement[] }>(`/api/staff/warehouses/${warehouseId}/movements`, { token }),
  });
  if (list.isLoading) return <PageSkeleton />;
  const rows = list.data?.movements ?? [];
  if (rows.length === 0) return <EmptyState title={t("warehouse.noHistoryTitle")} body={t("warehouse.noHistoryBody")} />;
  return (
    <SurfaceTable>
      <thead>
        <tr>
          <Th>{t("common.date")}</Th>
          <Th>{t("catalog.part")}</Th>
          <Th>{t("warehouse.what")}</Th>
          <Th>{t("common.qty")}</Th>
          <Th>{t("warehouse.by")}</Th>
          <Th>{t("payments.note")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <Td className="text-xs">{formatDateTime(row.createdAt)}</Td>
            <Td className="font-semibold">{row.part ? localizedName(row.part) : t("common.dash")}</Td>
            <Td>
              {t(`warehouse.move.${row.kind}`, { defaultValue: row.kind })}
              {row.technicianName ? <span className="block text-xs text-neutral-500">{row.technicianName}</span> : null}
            </Td>
            <Td className={row.quantity < 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</Td>
            <Td>{row.createdByName ?? t("common.dash")}</Td>
            <Td className="max-w-[16rem] whitespace-normal text-xs text-neutral-600">{row.note ?? t("common.dash")}</Td>
          </tr>
        ))}
      </tbody>
    </SurfaceTable>
  );
}
