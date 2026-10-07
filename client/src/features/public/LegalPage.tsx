import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";

type Section = { h: string; p: string };

/** Privacy policy and terms of use. Public, because the app stores and the sign-up page link to them. */
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = useTranslation();
  const sections = t(`legal.${kind}Doc.sections`, { returnObjects: true }) as unknown;
  const list = Array.isArray(sections) ? (sections as Section[]) : [];
  return (
    <BrandChrome action={<Link to="/" className="btn-rizo-ghost">{t("common.home")}</Link>}>
      <article className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16">
        <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t(`legal.${kind}Doc.title`)}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("legal.updated")}</p>
        <div className="mt-6 space-y-5">
          {list.map((section) => (
            <section key={section.h}>
              <h2 className="text-base font-extrabold text-neutral-900">{section.h}</h2>
              <p className="mt-1 text-sm whitespace-pre-line text-neutral-700">{section.p}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs text-neutral-500">
          <Link to={kind === "privacy" ? "/terms" : "/privacy"} className="font-semibold text-[#7B00E0] hover:underline">
            {kind === "privacy" ? t("legal.terms") : t("legal.privacy")}
          </Link>
        </p>
      </article>
    </BrandChrome>
  );
}
