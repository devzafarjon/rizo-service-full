import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { apiErrorMessage } from "../../lib/api";
import { useCustomerAuth } from "./CustomerAuthContext";

export function CustomerForgotPage() {
  const { t } = useTranslation();
  const { user, forgotPassword } = useCustomerAuth();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/portal" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await forgotPassword(phone);
      setTemporaryPassword(data.temporaryPassword);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BrandChrome
      action={
        <Link to="/portal/login" className="btn-rizo-ghost">
          {t("common.signIn")}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold text-[#B439FD]">{t("auth.portalKicker")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-black">{t("auth.forgotTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.forgotHint")}</p>
        </div>

        {temporaryPassword ? (
          <div className="rounded-2xl border border-gray-100 bg-[#FFF4E5] p-5 sm:p-6">
            <p className="text-sm font-semibold text-[#C56A00]">{t("auth.newPassword")}</p>
            <p className="mt-3 break-all font-mono text-2xl font-extrabold tracking-wide text-black">{temporaryPassword}</p>
            <p className="mt-3 text-sm text-gray-600">{t("auth.passwordOnce")}</p>
            <Link to="/portal/login" className="btn-rizo mt-5 h-12 w-full text-sm">
              {t("auth.backToSignIn")}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-6">
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("common.phone")}</span>
              <input
                className="h-12 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                autoComplete="tel"
              />
            </label>
            {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}
            <button type="submit" disabled={submitting} className="btn-rizo h-12 w-full text-sm">
              {submitting ? <Spinner className="h-4 w-4" /> : null}
              {t("auth.createPassword")}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("auth.noAccount")}{" "}
          <Link to="/portal/signup" className="font-semibold text-[#B439FD] hover:underline">
            {t("auth.signUp")}
          </Link>
        </p>
      </div>
    </BrandChrome>
  );
}
