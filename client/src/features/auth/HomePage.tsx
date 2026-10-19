import { homePathFor } from "../../lib/home";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandChrome } from "../../components/BrandChrome";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "./CustomerAuthContext";
import { useStaffAuth } from "./StaffAuthContext";

/** The front page for visitors. Someone with a remembered session goes straight to their own side instead of seeing it. */
export function HomePage() {
  const { t } = useTranslation();
  const { user: staff, loading: staffLoading } = useStaffAuth();
  const { user: customer, loading: customerLoading } = useCustomerAuth();

  // A saved session is being checked (the server may be waking up): wait, so the front page doesn't flash first.
  if (staffLoading || customerLoading) {
    return (
      <div className="min-h-dvh bg-[#FAFAFA] p-6">
        <PageSkeleton />
      </div>
    );
  }
  if (staff) return <Navigate to={homePathFor(staff.role)} replace />;
  if (customer) return <Navigate to="/portal" replace />;

  return (
    <BrandChrome
      variant="landing"
      action={
        <Link to="/login" className="btn-rizo-ghost h-11">
          {t("common.signIn")}
        </Link>
      }
    >
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-[#141824] sm:text-6xl sm:leading-[1]">{t("brand.service")}</h1>
        <p className="mt-5 max-w-xl text-base text-gray-500 sm:text-lg">{t("brand.tagline")}</p>
        <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/login" className="btn-rizo w-full sm:w-auto">
            {t("common.signIn")}
          </Link>
          <Link to="/portal/signup" className="btn-rizo-orange w-full sm:w-auto">
            {t("auth.createAccount")}
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-[#7B00E0]">
          <Link to="/track" className="hover:underline">
            {t("home.track")}
          </Link>
          <Link to="/centers" className="hover:underline">
            {t("home.centers")}
          </Link>
        </div>
      </section>
    </BrandChrome>
  );
}
