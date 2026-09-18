import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStaffAuth } from "./StaffAuthContext";

export function StaffHomePage() {
  const { t } = useTranslation();
  const { user } = useStaffAuth();

  if (!user) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-[#B439FD]">{t("staffHome.welcome")}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-black sm:text-3xl">
        {user.name}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-500">{t("staffHome.intro")}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HomeCard title={t("staffHome.customersTitle")} body={t("staffHome.customersBody")} to="/app/customers" milestone={t("staffHome.records")} />
        <HomeCard title={t("staffHome.salesTitle")} body={t("staffHome.salesBody")} to="/app/sales" milestone={t("staffHome.records")} />
        <HomeCard title={t("staffHome.boardTitle")} body={t("staffHome.boardBody")} to="/app/kanban" milestone={t("staffHome.jobs")} />
        <HomeCard title={t("staffHome.newTitle")} body={t("staffHome.newBody")} to="/app/requests/new" milestone={t("staffHome.jobs")} />
        <HomeCard title={t("staffHome.catalogTitle")} body={t("staffHome.catalogBody")} to="/app/catalog" milestone={t("staffHome.records")} />
        <HomeCard title={t("staffHome.reportsTitle")} body={t("staffHome.reportsBody")} to="/app/reports" milestone={t("staffHome.insights")} />
      </div>
    </div>
  );
}

function HomeCard({
  title,
  body,
  to,
  milestone,
}: {
  title: string;
  body: string;
  to: string;
  milestone: string;
}) {
  return (
    <Link
      to={to}
      className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition hover:shadow-[0_8px_30px_rgba(180,57,253,0.12)]"
    >
      <span className="absolute top-4 right-4 h-2.5 w-2.5 rounded-full bg-[#B439FD]" />
      <p className="text-xs font-bold tracking-wide text-[#F6921E] uppercase">{milestone}</p>
      <h2 className="mt-2 text-lg font-bold text-black">{title}</h2>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
    </Link>
  );
}
