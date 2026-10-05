import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";

export function ComingSoonPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="mb-6 text-2xl text-neutral-900 font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{title}</h1>
      <EmptyState title={t("common.comingSoon")} body={body} />
    </div>
  );
}
