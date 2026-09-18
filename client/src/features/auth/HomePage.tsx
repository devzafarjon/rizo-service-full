import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandChrome } from "../../components/BrandChrome";
import { useCustomerAuth } from "./CustomerAuthContext";
import { useStaffAuth } from "./StaffAuthContext";

export function HomePage() {
  const { t } = useTranslation();
  const { user: staff } = useStaffAuth();
  const { user: customer } = useCustomerAuth();

  const staffTo = staff ? (staff.role === "technician" ? "/app/my-jobs" : "/app") : "/login";
  const portalTo = customer ? "/portal" : "/portal/login";

  return (
    <BrandChrome
      action={
        <Link to={staffTo} className="btn-rizo-ghost">
          {staff ? t("home.staffContinue") : t("home.staff")}
        </Link>
      }
    >
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-black sm:text-6xl sm:leading-[1]">
          {t("brand.service")}
        </h1>
        <p className="mt-5 max-w-xl text-base text-gray-500 sm:text-lg">{t("brand.tagline")}</p>
        <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to={staffTo} className="btn-rizo w-full sm:w-auto">
            {staff ? t("home.staffContinue") : t("home.staff")}
          </Link>
          <Link to={portalTo} className="btn-rizo-orange w-full sm:w-auto">
            {customer ? t("home.portalContinue") : t("home.portal")}
          </Link>
        </div>
      </section>
    </BrandChrome>
  );
}
