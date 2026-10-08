import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BrandChrome } from "../../components/BrandChrome";
import { Spinner } from "../../components/Spinner";
import { api } from "../../lib/api";
import type { HelpArticle } from "../../lib/types";
import { HelpArticles } from "../portal/PortalHelpPage";

/** Self-help guides for anyone, no sign-in. */
export function PublicHelpPage() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: ["public", "help"], queryFn: () => api<{ articles: HelpArticle[] }>("/api/public/help") });
  const articles = list.data?.articles ?? [];
  return (
    <BrandChrome action={<Link to="/track" className="btn-rizo-ghost h-11">{t("track.title")}</Link>}>
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16">
        <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("help.title")}</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-500">{t("help.intro")}</p>
        {list.isLoading ? <Spinner className="mx-auto h-6 w-6" /> : null}
        {!list.isLoading && articles.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-neutral-500">{t("help.noneBody")}</p> : null}
        <HelpArticles articles={articles} />
      </div>
    </BrandChrome>
  );
}
