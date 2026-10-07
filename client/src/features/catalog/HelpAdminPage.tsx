import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass, textareaClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { HelpArticle } from "../../lib/types";

type Draft = {
  id: string | null;
  productCategory: string;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  bodyUz: string;
  bodyRu: string;
  bodyEn: string;
  videoUrl: string;
  sortOrder: string;
  isPublished: boolean;
};

const empty: Draft = { id: null, productCategory: "", titleUz: "", titleRu: "", titleEn: "", bodyUz: "", bodyRu: "", bodyEn: "", videoUrl: "", sortOrder: "0", isPublished: true };

/** Self-help guides customers read before booking a visit (in the app, on the website and on the tracking page). */
export function HelpAdminPage() {
  const { t, i18n } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const lang = (i18n.language.slice(0, 2) as "uz" | "ru" | "en") || "uz";

  const list = useQuery({
    queryKey: ["staff", "help-articles"],
    enabled: Boolean(token),
    queryFn: () => api<{ articles: HelpArticle[] }>("/api/staff/help-articles", { token }),
  });
  const categories = useQuery({
    queryKey: ["staff", "categories"],
    enabled: Boolean(token),
    queryFn: () => api<{ categories: string[] }>("/api/staff/catalog/categories", { token }),
  });

  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = { productCategory: value.productCategory || null, titleUz: value.titleUz, titleRu: value.titleRu, titleEn: value.titleEn, bodyUz: value.bodyUz, bodyRu: value.bodyRu, bodyEn: value.bodyEn, videoUrl: value.videoUrl || null, sortOrder: Number(value.sortOrder) || 0, isPublished: value.isPublished };
      return value.id ? api(`/api/staff/help-articles/${value.id}`, { method: "PATCH", token, body: JSON.stringify(body) }) : api("/api/staff/help-articles", { method: "POST", token, body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      setDraft(null);
      notify(t("help.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "help-articles"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/help-articles/${id}`, { method: "DELETE", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "help-articles"] }),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  const rows = list.data?.articles ?? [];
  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft) save.mutate(draft);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("help.adminTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("help.adminIntro")}</p>
        </div>
        <button type="button" className="btn-rizo" onClick={() => setDraft(empty)}>
          <Plus size={16} />
          {t("help.new")}
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("help.emptyTitle")} body={t("help.emptyBody")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <section key={row.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-wide text-[#7B00E0] uppercase">{row.productCategory ? categoryLabel(row.productCategory) : t("help.general")}</p>
                  <h2 className="font-bold text-neutral-900">{row.title[lang] || row.title.uz || row.title.en}</h2>
                  {!row.isPublished ? <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase">{t("help.hidden")}</span> : null}
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  <button type="button" className="text-neutral-600 hover:text-[#7B00E0]" onClick={() => setDraft({ id: row.id, productCategory: row.productCategory ?? "", titleUz: row.title.uz, titleRu: row.title.ru, titleEn: row.title.en, bodyUz: row.body.uz, bodyRu: row.body.ru, bodyEn: row.body.en, videoUrl: row.videoUrl ?? "", sortOrder: String(row.sortOrder), isPublished: row.isPublished })}>
                    {t("common.edit")}
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => window.confirm(t("help.confirmDelete")) && remove.mutate(row.id)}>
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-neutral-600">{row.body[lang] || row.body.uz || row.body.en}</p>
            </section>
          ))}
        </div>
      )}

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? t("help.edit") : t("help.new")} wide>
        {draft ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("catalog.category")}>
                <select className={inputClass} value={draft.productCategory} onChange={(event) => set({ productCategory: event.target.value })}>
                  <option value="">{t("help.general")}</option>
                  {(categories.data?.categories ?? []).map((name) => (
                    <option key={name} value={name}>
                      {categoryLabel(name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("help.video")} hint={t("help.videoHint")}>
                <input className={inputClass} type="url" placeholder="https://" value={draft.videoUrl} onChange={(event) => set({ videoUrl: event.target.value })} />
              </Field>
              <Field label={t("help.order")}>
                <input className={inputClass} type="number" min={0} max={999} value={draft.sortOrder} onChange={(event) => set({ sortOrder: event.target.value })} />
              </Field>
            </div>
            {(["uz", "ru", "en"] as const).map((code) => {
              const cap = (code.charAt(0).toUpperCase() + code.slice(1)) as "Uz" | "Ru" | "En";
              const titleKey = `title${cap}` as "titleUz" | "titleRu" | "titleEn";
              const bodyKey = `body${cap}` as "bodyUz" | "bodyRu" | "bodyEn";
              return (
                <div key={code} className="rounded-xl border border-neutral-200 p-3">
                  <p className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t(`languages.${code}`)}</p>
                  <input className={inputClass} placeholder={t("help.titleLabel")} value={draft[titleKey]} maxLength={160} onChange={(event) => set({ [titleKey]: event.target.value })} />
                  <textarea className={`${textareaClass} mt-2`} placeholder={t("help.bodyLabel")} value={draft[bodyKey]} maxLength={6000} onChange={(event) => set({ [bodyKey]: event.target.value })} />
                </div>
              );
            })}
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={draft.isPublished} onChange={(event) => set({ isPublished: event.target.checked })} />
              {t("help.published")}
            </label>
            <button type="submit" className="btn-rizo h-12 w-full" disabled={save.isPending}>
              {save.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("common.save")}
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
