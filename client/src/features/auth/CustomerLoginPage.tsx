import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { apiErrorMessage } from "../../lib/api";
import { useCustomerAuth } from "./CustomerAuthContext";

export function CustomerLoginPage() {
  const { t } = useTranslation();
  const { user, login } = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("998900000003");
  const [password, setPassword] = useState("customer123");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/portal" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(phone, password);
      notify(t("auth.signedIn"));
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || "/portal", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BrandChrome
      action={
        <Link to="/portal/signup" className="btn-rizo-ghost">
          {t("auth.createAccount")}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold text-[#B439FD]">{t("auth.portalKicker")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-black">{t("auth.portalTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.portalHint")}</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("common.phone")}</span>
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="h-12 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2"
              placeholder="998 90 000 00 03"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("common.password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2"
            />
          </label>
          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className="btn-rizo h-12 w-full text-sm">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {t("common.signIn")}
          </button>
          <p className="mt-4 text-center text-sm text-gray-500">
            {t("auth.forgot")}{" "}
            <Link to="/portal/forgot" className="font-semibold text-[#B439FD] hover:underline">
              {t("auth.resetIt")}
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-gray-500">
            {t("auth.newHere")}{" "}
            <Link to="/portal/signup" className="font-semibold text-[#B439FD] hover:underline">
              {t("auth.createAccount")}
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("auth.staffLink")}{" "}
          <Link to="/login" className="font-semibold text-[#B439FD] hover:underline">
            {t("auth.staffSignIn")}
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-gray-400">
          {t("auth.demoCustomer")}: <span className="font-medium">998900000003 / customer123</span>
        </p>
      </div>
    </BrandChrome>
  );
}
