import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function BackupSettingsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-neutral-500">{t("settings.intro")}</p>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.backupTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.backupBody")}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-neutral-600">
          <li>{t("settings.backupEnv")}</li>
          <li>{t("settings.backupManual")}</li>
          <li>{t("settings.backupRetain")}</li>
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.restoreTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.restoreBody")}</p>
      </section>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-extrabold">{t("settings.stockTitle")}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t("settings.stockBody")}</p>
        <Link to="/app/catalog" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#F3E8FF] px-4 text-sm font-bold text-[#B439FD]">
          {t("settings.openCatalog")}
        </Link>
      </section>
    </div>
  );
}
