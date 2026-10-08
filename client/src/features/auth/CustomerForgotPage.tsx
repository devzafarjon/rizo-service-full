import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react";
import { AuthInput } from "../../components/AuthInput";
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
  const [sent, setSent] = useState(false);

  if (user) {
    return <Navigate to="/portal" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(phone);
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BrandChrome
      action={
        <Link to="/portal/login" className="btn-rizo-ghost h-11">
          {t("common.signIn")}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-[29rem] flex-col px-4 pt-6 pb-12 sm:pt-8">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold tracking-wide text-[#7B00E0] uppercase">{t("auth.portalKicker")}</p>
          <h1 className="mt-2 text-[25px] leading-tight font-extrabold text-[#222834]">{t("auth.forgotTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.forgotHint")}</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-gray-100 bg-[#FFF4E5] p-5 sm:p-6">
            <p className="text-sm font-semibold text-[#C56A00]">{t("auth.resetSentTitle")}</p>
            <p className="mt-3 text-sm text-gray-600">{t("auth.resetSentBody")}</p>
            <Link to="/portal/login" className="btn-rizo mt-5 h-12 w-full text-sm">
              {t("auth.backToSignIn")}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="w-full">
            <label className="mb-4 block">
              <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.phone")}</span>
              <AuthInput icon={Phone}
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
          <Link to="/portal/signup" className="font-bold text-[#7B00E0] hover:underline">
            {t("auth.signUp")}
          </Link>
        </p>
      </div>
    </BrandChrome>
  );
}
