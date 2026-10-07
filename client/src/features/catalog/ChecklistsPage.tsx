import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { ChecklistItem, ChecklistTemplate } from "../../lib/types";

type Draft = { id: string | null; kind: "diagnosis" | "completion"; productCategory: string; items: ChecklistItem[] };

const newItem = (): ChecklistItem => ({ id: `i${Math.random().toString(36).slice(2, 8)}`, uz: "", ru: "", en: "", required: false });

/** Steps a technician ticks off during diagnosis and before completing a job. Required steps block completion. */
export function ChecklistsPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const list = useQuery({
    queryKey: ["staff", "checklists"],
    enabled: Boolean(token),
    queryFn: () => api<{ checklists: ChecklistTemplate[] }>("/api/staff/checklists", { token }),
  });
  const categories = useQuery({
    queryKey: ["staff", "categories"],
    enabled: Boolean(token),
    queryFn: () => api<{ categories: string[] }>("/api/staff/catalog/categories", { token }),
  });

  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = { kind: value.kind, productCategory: value.productCategory || null, items: value.items.filter((item) => item.uz || item.ru || item.en).map((item) => ({ ...item, uz: item.uz || item.en || item.ru, ru: item.ru || item.en || item.uz, en: item.en || item.uz || item.ru })) };
      return value.id ? api(`/api/staff/checklists/${value.id}`, { method: "PATCH", token, body: JSON.stringify({ items: body.items }) }) : api("/api/staff/checklists", { method: "POST", token, body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      setDraft(null);
      notify(t("checklists.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "checklists"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/checklists/${id}`, { method: "DELETE", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "checklists"] }),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  const rows = list.data?.checklists ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft) save.mutate(draft);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("checklists.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("checklists.intro")}</p>
        </div>
        <button type="button" className="btn-rizo" onClick={() => setDraft({ id: null, kind: "completion", productCategory: "", items: [newItem()] })}>
          <Plus size={16} />
          {t("checklists.new")}
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("checklists.emptyTitle")} body={t("checklists.emptyBody")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <section key={row.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-wide text-[#7B00E0] uppercase">{t(`checklists.kind.${row.kind}`)}</p>
                  <h2 className="font-bold text-neutral-900">{row.productCategory ? categoryLabel(row.productCategory) : t("checklists.allCategories")}</h2>
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  <button type="button" className="text-neutral-600 hover:text-[#7B00E0]" onClick={() => setDraft({ id: row.id, kind: row.kind, productCategory: row.productCategory ?? "", items: row.items })}>
                    {t("common.edit")}
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => window.confirm(t("checklists.confirmDelete")) && remove.mutate(row.id)}>
                    {t("common.delete")}
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {row.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm border border-neutral-300" aria-hidden />
                    <span>{item[(document.documentElement.lang.slice(0, 2) as "uz" | "ru" | "en")] || item.uz || item.en}</span>
                    {item.required ? <span className="rounded-full bg-[#F5EBFD] px-2 py-0.5 text-[10px] font-bold text-[#7B00E0] uppercase">{t("checklists.required")}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? t("checklists.edit") : t("checklists.new")} wide>
        {draft ? (
          <form onSubmit={submit} className="space-y-4">
            {!draft.id ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("checklists.kindLabel")}>
                  <select className={inputClass} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Draft["kind"] })}>
                    <option value="diagnosis">{t("checklists.kind.diagnosis")}</option>
                    <option value="completion">{t("checklists.kind.completion")}</option>
                  </select>
                </Field>
                <Field label={t("catalog.category")}>
                  <select className={inputClass} value={draft.productCategory} onChange={(event) => setDraft({ ...draft, productCategory: event.target.value })}>
                    <option value="">{t("checklists.allCategories")}</option>
                    {(categories.data?.categories ?? []).map((name) => (
                      <option key={name} value={name}>
                        {categoryLabel(name)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
            <div className="space-y-3">
              {draft.items.map((item, index) => (
                <div key={item.id} className="rounded-xl border border-neutral-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["uz", "ru", "en"] as const).map((lang) => (
                      <input key={lang} className={inputClass} placeholder={t(`languages.${lang}`)} value={item[lang]} maxLength={160} onChange={(event) => setDraft({ ...draft, items: draft.items.map((row, i) => (i === index ? { ...row, [lang]: event.target.value } : row)) })} />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={item.required} onChange={(event) => setDraft({ ...draft, items: draft.items.map((row, i) => (i === index ? { ...row, required: event.target.checked } : row)) })} />
                      {t("checklists.requiredHint")}
                    </label>
                    <button type="button" className="text-red-600" aria-label={t("common.delete")} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })} disabled={draft.items.length === 1}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="text-sm font-bold text-[#7B00E0] hover:underline" onClick={() => setDraft({ ...draft, items: [...draft.items, newItem()] })}>
              + {t("checklists.addItem")}
            </button>
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
