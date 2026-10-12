import { PackageSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../lib/format";
import type { PartWait } from "../../lib/types";

/** Tells a customer whose job waits for a spare part whether it is ordered and when it should arrive. */
export function PartWaitBanner({ wait }: { wait: PartWait | null | undefined }) {
  const { t } = useTranslation();
  if (!wait) return null;
  return (
    <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${wait.late ? "bg-red-50 text-red-900" : "bg-[#F5EBFD] text-[#5A0085]"}`}>
      <p className="flex items-center gap-2 font-extrabold">
        <PackageSearch size={16} />
        {t("portal.partWait.title")}
      </p>
      <p className="mt-1 font-semibold">{wait.ordered ? t("portal.partWait.ordered") : t("portal.partWait.notOrdered")}</p>
      {wait.expectedAt ? <p className="mt-0.5 font-semibold">{t("portal.partWait.expected", { date: formatDate(wait.expectedAt) })}</p> : null}
      {wait.late ? <p className="mt-0.5 font-bold">{t("portal.partWait.late")}</p> : null}
    </div>
  );
}
