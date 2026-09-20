import { useTranslation } from "react-i18next";
import { StaffAlertsInbox } from "./StaffAlertsInbox";

export function AlertsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("alerts.title")}</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">{t("alerts.pageIntro")}</p>
      <StaffAlertsInbox />
    </div>
  );
}
