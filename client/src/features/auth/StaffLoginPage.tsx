import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Phone } from "lucide-react";
import { AuthInput } from "../../components/AuthInput";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { apiErrorMessage } from "../../lib/api";
import { useStaffAuth } from "./StaffAuthContext";

export function StaffLoginPage() {
  const { t } = useTranslation();
  const { user, login } = useStaffAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("998900000001");
  const [password, setPassword] = useState("admin123");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <Navigate to={user.role === "technician" ? "/app/my-jobs" : "/app"} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const next = await login(phone, password);
      notify(t("auth.signedIn"));
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || (next.role === "technician" ? "/app/my-jobs" : "/app"), { replace: true });
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
          {t("auth.openPortal")}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-[29rem] flex-col px-4 pt-6 pb-12 sm:pt-8">
        <div className="mb-8 text-center">
          <h1 className="text-[25px] leading-tight font-extrabold text-[#222834]">{t("auth.staffTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.staffHint")}</p>
        </div>

        <form onSubmit={onSubmit} className="w-full">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.phone")}</span>
            <AuthInput icon={Phone}
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="998 90 000 00 01"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.password")}</span>
            <AuthInput icon={KeyRound}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className="btn-rizo h-12 w-full text-sm">
            {submitting ? <Spinner className="h-4 w-4" /> : null}
            {t("common.signIn")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("auth.customerLink")}{" "}
          <Link to="/portal/login" className="font-bold text-[#7B00E0] hover:underline">
            {t("auth.openPortal")}
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-gray-400">
          {t("auth.demoAdmin")} <span className="font-medium">998900000001 / admin123</span>
          <br />
          {t("auth.demoTech")} <span className="font-medium">998900000002 / tech123</span>
        </p>
      </div>
    </BrandChrome>
  );
}
