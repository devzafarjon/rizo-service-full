import { useQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "../auth/CustomerAuthContext";
import { api } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { HelpArticle } from "../../lib/types";

/** Short guides for common problems, so a visit is not needed for something a customer can fix in five minutes. */
export function HelpArticles({ articles }: { articles: HelpArticle[] }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language.slice(0, 2) as "uz" | "ru" | "en") || "uz";
  return (
    <ul className="space-y-3">
      {articles.map((article) => (
        <li key={article.id}>
          <details className="group rounded-2xl border border-neutral-200 bg-white p-4 open:shadow-sm">
            <summary className="cursor-pointer list-none">
              <span className="block text-xs font-bold tracking-wide text-[#7B00E0] uppercase">{article.productCategory ? categoryLabel(article.productCategory) : t("help.general")}</span>
              <span className="mt-0.5 block font-bold text-neutral-900">{article.title[lang] || article.title.uz || article.title.en}</span>
            </summary>
            <p className="mt-3 text-sm whitespace-pre-line text-neutral-700">{article.body[lang] || article.body.uz || article.body.en}</p>
            {article.videoUrl ? (
              <a href={article.videoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#7B00E0] hover:underline">
                <PlayCircle size={18} />
                {t("help.watch")}
              </a>
            ) : null}
          </details>
        </li>
      ))}
    </ul>
  );
}

export function PortalHelpPage() {
  const { t } = useTranslation();
  const { token } = useCustomerAuth();
  const list = useQuery({
    queryKey: ["customer", "help"],
    enabled: Boolean(token),
    queryFn: () => api<{ articles: HelpArticle[] }>("/api/customer/help", { token }),
  });
  if (list.isLoading) return <PageSkeleton />;
  const articles = list.data?.articles ?? [];
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("help.title")}</h1>
      <p className="mt-1 mb-5 text-sm text-neutral-500">{t("help.intro")}</p>
      {articles.length === 0 ? <EmptyState title={t("help.noneTitle")} body={t("help.noneBody")} /> : <HelpArticles articles={articles} />}
    </div>
  );
}
