import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatRequestId } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { encodeRequestTag } from "../../lib/qrTag";
import type { ServiceRequest } from "../../lib/types";

export function PrintTagPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useStaffAuth();
  const [qr, setQr] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["staff", "requests", id],
    enabled: Boolean(token && id),
    queryFn: () => api<{ request: ServiceRequest }>(`/api/staff/requests/${id}`, { token }),
  });

  const request = detail.data?.request;

  useEffect(() => {
    if (!request) return;
    void QRCode.toDataURL(encodeRequestTag(request.displayId), { margin: 0, width: 320 }).then(setQr);
  }, [request]);

  if (detail.isLoading) return <PageSkeleton />;
  if (!request) return <EmptyState title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/app/requests/${request.id}`} className="text-sm font-semibold text-[#7B00E0]">
          {t("common.back")}
        </Link>
        <button type="button" onClick={() => window.print()} className="h-12 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("common.print")}
        </button>
      </div>
      <article className="mx-auto w-[220px] rounded-xl border border-neutral-300 bg-white p-3 text-center">
        {qr ? <img src={qr} alt={formatRequestId(request.displayId)} className="mx-auto h-36 w-36" /> : null}
        <p className="mt-2 font-mono text-sm font-extrabold">{formatRequestId(request.displayId)}</p>
        <p className="mt-1 truncate text-xs font-bold">{request.customer.name}</p>
        <p className="truncate text-[11px] text-neutral-500">{localizedName(request.product)}</p>
        {request.serialNumber ? <p className="truncate font-mono text-[10px] text-neutral-500">{request.serialNumber}</p> : null}
      </article>
    </div>
  );
}
