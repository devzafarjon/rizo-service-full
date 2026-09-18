import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { apiErrorMessage } from "../../lib/api";
import { useCustomerAuth } from "./CustomerAuthContext";

const inputClass =
  "h-12 w-full rounded-lg border border-gray-200 bg-white px-3 outline-none ring-[#B439FD] focus:ring-2";

export function CustomerSignupPage() {
  const { t } = useTranslation();
  const { user, signup } = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
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
      await signup({ name, phone, password, address: address.trim() || undefined });
      notify(t("auth.accountCreated"));
      navigate("/portal", { replace: true });
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
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-black">{t("auth.signupTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.signupHint")}</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-6">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("auth.fullName")}</span>
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("common.phone")}</span>
            <input className={inputClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" placeholder="998 90 000 00 03" />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("common.password")}</span>
            <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t("auth.addressOptional")}</span>
            <input className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
          </label>
          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className="btn-rizo h-12 w-full text-sm">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {t("auth.createAccount")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("auth.haveAccount")}{" "}
          <Link to="/portal/login" className="font-semibold text-[#B439FD] hover:underline">
            {t("common.signIn")}
          </Link>
        </p>
      </div>
    </BrandChrome>
  );
}
