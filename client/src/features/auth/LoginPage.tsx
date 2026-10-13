import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Phone } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthInput } from "../../components/AuthInput";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { ApiError, api, apiErrorMessage } from "../../lib/api";
import { SHOW_DEMO } from "../../lib/demo";
import { homePathFor } from "../../lib/home";
import { forgetPhone, readLastPhone, rememberPhone } from "../../lib/lastAccount";
import type { CustomerUser, StaffUser } from "../../lib/types";
import { useCustomerAuth } from "./CustomerAuthContext";
import { useStaffAuth } from "./StaffAuthContext";

type Side = "staff" | "customer";
type LoginAnswer = { choose: Side[] } | { scope: "staff"; token: string; user: StaffUser } | { scope: "customer"; token: string; user: CustomerUser };

/** Where to go after signing in: back to the page that asked for it, but only when it belongs to the side that signed in. */
function landing(side: Side, from: string | undefined, staffHome: string) {
  if (side === "customer") return from && from.startsWith("/portal") ? from : "/portal";
  return from && from.startsWith("/app") ? from : staffHome;
}

/**
 * The one sign-in of the website. Staff and customers type the same phone and password; the server says which side it is and the
 * person lands in the right place. Staff with two-step sign-in are asked for the code; a phone and password that open both a staff
 * and a customer account ask which one.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const staffAuth = useStaffAuth();
  const customerAuth = useCustomerAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const remembered = readLastPhone();
  const [phone, setPhone] = useState(remembered || (SHOW_DEMO ? "998900000001" : ""));
  const [password, setPassword] = useState(remembered ? "" : SHOW_DEMO ? "admin123" : "");
  const [usingRemembered, setUsingRemembered] = useState(Boolean(remembered));
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [choose, setChoose] = useState<Side[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in: straight to where that person works.
  if (staffAuth.user) return <Navigate to={homePathFor(staffAuth.user.role)} replace />;
  if (customerAuth.user) return <Navigate to="/portal" replace />;

  async function submit(as?: Side) {
    setSubmitting(true);
    setError(null);
    try {
      const answer = await api<LoginAnswer>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password, ...(needCode && code ? { code } : {}), ...(as ? { as } : {}) }),
      });
      if ("choose" in answer) {
        setChoose(answer.choose);
        return;
      }
      rememberPhone(phone);
      const from = (location.state as { from?: string } | null)?.from;
      if (answer.scope === "staff") {
        const user = await staffAuth.acceptLogin(answer.token, answer.user);
        notify(t("auth.signedIn"));
        navigate(landing("staff", from, homePathFor(user.role)), { replace: true });
      } else {
        await customerAuth.acceptLogin(answer.token, answer.user);
        notify(t("auth.signedIn"));
        navigate(landing("customer", from, "/portal"), { replace: true });
      }
    } catch (err) {
      // Two-step sign-in: the server asks for the six-digit code from the authenticator app.
      if (err instanceof ApiError && err.code === "totpRequired") setNeedCode(true);
      setError(err instanceof ApiError && err.code === "totpRequired" ? t("security.codeNeeded") : apiErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <BrandChrome
      action={
        <Link to="/portal/signup" className="btn-rizo-ghost h-11">
          {t("auth.createAccount")}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-[29rem] flex-col px-4 pt-6 pb-12 sm:pt-8">
        <div className="mb-8 text-center">
          <h1 className="text-[25px] leading-tight font-extrabold text-[#222834]">{t("auth.loginTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("auth.loginHint")}</p>
        </div>

        <form onSubmit={onSubmit} className="w-full">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.phone")}</span>
            <AuthInput icon={Phone} type="tel" name="username" autoComplete="username" value={phone} onChange={(event) => {
                setPhone(event.target.value);
                setChoose(null);
              }} placeholder="998 90 123 45 67" />
            {usingRemembered ? (
              <button
                type="button"
                className="mt-1.5 text-xs font-semibold text-[#7B00E0] hover:underline"
                onClick={() => {
                  forgetPhone();
                  setPhone("");
                  setPassword("");
                  setUsingRemembered(false);
                }}
              >
                {t("auth.otherAccount")}
              </button>
            ) : null}
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.password")}</span>
            <AuthInput icon={KeyRound} type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => {
                setPassword(event.target.value);
                setChoose(null);
              }} />
          </label>
          {needCode ? (
            <label className="mb-4 block">
              <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("security.code")}</span>
              <AuthInput icon={KeyRound} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" autoFocus />
            </label>
          ) : null}
          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}

          {choose ? (
            <div className="mb-3 rounded-xl border border-[#E0CDF2] bg-[#F5EBFD] p-3">
              <p className="mb-2 text-sm font-semibold text-[#4B0082]">{t("auth.chooseSide")}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {choose.map((side) => (
                  <button key={side} type="button" disabled={submitting} onClick={() => void submit(side)} className="btn-rizo h-11 flex-1 text-sm">
                    {t(side === "staff" ? "auth.asStaff" : "auth.asCustomer")}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button type="submit" disabled={submitting} className="btn-rizo h-12 w-full text-sm">
              {submitting ? <Spinner className="h-4 w-4" /> : null}
              {t("common.signIn")}
            </button>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">
            {t("auth.forgot")}{" "}
            <Link to="/portal/forgot" className="font-bold text-[#7B00E0] hover:underline">
              {t("auth.resetIt")}
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-gray-500">
            {t("auth.newHere")}{" "}
            <Link to="/portal/signup" className="font-bold text-[#7B00E0] hover:underline">
              {t("auth.createAccount")}
            </Link>
          </p>
        </form>

        {SHOW_DEMO ? (
          <p className="mt-6 text-center text-xs text-gray-400">
            {t("auth.demoBoth", { staff: "998900000001 / admin123", customer: "998900000003 / customer123" })}
          </p>
        ) : null}
      </div>
    </BrandChrome>
  );
}
