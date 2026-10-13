import { useTranslation } from "react-i18next";
import { SkillsEditor } from "./SkillsEditor";

export function MySkillsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("directory.mySkillsTitle")}</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">{t("directory.mySkillsIntro")}</p>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <SkillsEditor />
      </section>
    </div>
  );
}
