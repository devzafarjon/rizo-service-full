import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { RizoLogo } from "../../components/RizoLogo";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatPhone } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { Named, WarrantyStatus } from "../../lib/types";

type Card = {
  invoiceNumber: string;
  serialNumber: string | null;
  saleDate: string;
  installationDate: string | null;
  warrantyMonths: number;
  warrantyExpiry: string;
  warrantyStatus: WarrantyStatus;
  voided: boolean;
  voidReason: string | null;
  startsOn: "installation" | "sale";
  coversLabor: boolean;
  coversParts: boolean;
  customer: { name: string; phone: string };
  product: Named & { id: string; sku: string; category: string };
};

/** The printed warranty card (talon): product, serial, dates, what the warranty covers, signature lines. */
export function WarrantyCardPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useStaffAuth();
  const [qr, setQr] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["staff", "warranty-card", id],
    enabled: Boolean(token && id),
    queryFn: () => api<{ card: Card }>(`/api/staff/sales/${id}/warranty-card`, { token }),
  });
  const card = detail.data?.card;

  useEffect(() => {
    if (!card) return;
    void QRCode.toDataURL(card.serialNumber ? `RIZO-SN:${card.serialNumber}` : `RIZO-INV:${card.invoiceNumber}`, { margin: 0, width: 240 }).then(setQr);
  }, [card]);

  if (detail.isLoading) return <PageSkeleton />;
  if (!card) return <EmptyState title={t("detail.notFoundTitle")} body={t("detail.notFoundBody")} />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to="/app/sales" className="text-sm font-semibold text-[#7B00E0]">
          {t("common.back")}
        </Link>
        <button type="button" onClick={() => window.print()} className="h-12 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("common.print")}
        </button>
      </div>
      <article className="receipt-sheet overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 print:rounded-none print:ring-0">
        <header className="relative bg-[#7B00E0] px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white px-2 py-1">
                <RizoLogo className="h-8 w-auto" />
              </div>
              <div>
                <p className="text-lg font-extrabold">{t("brand.service")}</p>
                <p className="text-xs font-semibold tracking-wide text-white/80 uppercase">{t("warrantyCard.title")}</p>
              </div>
            </div>
            {qr ? <img src={qr} alt="" className="h-16 w-16 rounded bg-white p-1" /> : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#F7941E]" />
        </header>
        <div className="space-y-5 px-6 py-5 text-sm">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              [t("common.product"), `${localizedName(card.product)} · ${card.product.sku}`],
              [t("serial.label"), card.serialNumber ?? t("common.dash")],
              [t("common.invoice"), card.invoiceNumber],
              [t("common.customer"), `${card.customer.name} · ${formatPhone(card.customer.phone)}`],
              [t("sales.saleDate"), formatDate(card.saleDate)],
              [t("sales.installedOn"), card.installationDate ? formatDate(card.installationDate) : t("common.dash")],
              [t("sales.warrantyMonths"), String(card.warrantyMonths)],
              [t("sales.warrantyUntil"), formatDate(card.warrantyExpiry)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{label}</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">{value}</dd>
              </div>
            ))}
          </dl>
          {card.voided ? <p className="rounded-xl bg-red-50 px-4 py-3 font-bold text-red-700">{t("warrantyCard.voided", { reason: card.voidReason ?? "" })}</p> : null}
          <section>
            <h2 className="text-[11px] font-bold tracking-wide text-[#7B00E0] uppercase">{t("warrantyCard.coverage")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
              <li>{t("warrantyCard.starts", { when: t(`warrantyCard.startsOn.${card.startsOn}`) })}</li>
              <li>{card.coversLabor ? t("warrantyCard.laborCovered") : t("warrantyCard.laborNotCovered")}</li>
              <li>{card.coversParts ? t("warrantyCard.partsCovered") : t("warrantyCard.partsNotCovered")}</li>
              <li>{t("warrantyCard.exclusions")}</li>
            </ul>
          </section>
          <div className="grid grid-cols-2 gap-8 pt-6 text-xs text-neutral-500">
            <div className="border-t border-neutral-400 pt-1">{t("warrantyCard.sellerSign")}</div>
            <div className="border-t border-neutral-400 pt-1">{t("warrantyCard.customerSign")}</div>
          </div>
        </div>
      </article>
    </div>
  );
}
