import { useMutation } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { AuthInput } from "../../components/AuthInput";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { api, apiErrorMessage } from "../../lib/api";
import { normalizeDisplayId } from "../../lib/format";

/** Find a request without signing in: the request number plus the phone number on the account. */
export function TrackLookupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [displayId, setDisplayId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lookup = useMutation({
    mutationFn: () => api<{ token: string }>("/api/public/track", { method: "POST", body: JSON.stringify({ displayId: normalizeDisplayId(displayId), phone }) }),
    onSuccess: (data) => navigate(`/t/${data.token}`),
    onError: (err) => setError(apiErrorMessage(err, t)),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    lookup.mutate();
  }
  return (
    <BrandChrome action={<Link to="/centers" className="btn-rizo-ghost h-11">{t("centers.public.title")}</Link>}>
      <div className="mx-auto flex w-full max-w-[29rem] flex-col px-4 pt-6 pb-12 sm:pt-8">
        <div className="mb-8 text-center">
          <h1 className="text-[25px] leading-tight font-extrabold text-[#222834]">{t("track.title")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("track.hint")}</p>
        </div>
        <form onSubmit={submit} className="w-full">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.requestId")}</span>
            <input className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 font-mono text-[13px] font-semibold outline-none focus:border-[#7B00E0]/40 focus:ring-[3px] focus:ring-[#7B00E0]/25" value={displayId} onChange={(event) => setDisplayId(event.target.value)} required placeholder="#051026010001" inputMode="numeric" />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[10.24px] font-bold tracking-wide text-gray-700 uppercase">{t("common.phone")}</span>
            <AuthInput icon={Phone} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" />
          </label>
          {error ? <p className="mb-3 text-sm font-medium text-red-600">{error}</p> : null}
          <button type="submit" disabled={lookup.isPending} className="btn-rizo h-12 w-full text-sm">
            {lookup.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("track.find")}
          </button>
        </form>
      </div>
    </BrandChrome>
  );
}
