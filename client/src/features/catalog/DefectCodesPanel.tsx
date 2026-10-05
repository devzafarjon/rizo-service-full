import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { categoryLabel, localizedName, namedFields } from "../../lib/localized";
import type { Named } from "../../lib/types";

type Code = Named & { id: string; kind: "defect" | "return_reason"; code: string; productCategory: string | null; isActive: boolean };

/** Standard fault codes (used at diagnosis and in defect reports) and return reasons (used for refunds). */
export function DefectCodesPanel({ categories }: { categories: string[] }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Code | "new" | null>(null);
  const [form, setForm] = useState({ kind: "defect" as Code["kind"], code: "", nameUz: "", nameRu: "", nameEn: "", productCategory: "", isActive: true });
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["staff", "defect-codes"],
    enabled: Boolean(token),
    queryFn: () => api<{ codes: Code[] }>("/api/staff/defect-codes", { token }),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ ...form, productCategory: form.productCategory || null });
      return editing && editing !== "new"
        ? api(`/api/staff/defect-codes/${editing.id}`, { method: "PATCH", token, body })
        : api("/api/staff/defect-codes", { method: "POST", token, body });
    },
    onSuccess: async () => {
      setEditing(null);
      notify(t("defectCodes.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "defect-codes"] });
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  function start(code: Code | "new") {
    setEditing(code);
    setError(null);
    setForm(code === "new" ? { kind: "defect", code: "", nameUz: "", nameRu: "", nameEn: "", productCategory: "", isActive: true } : { kind: code.kind, code: code.code, ...namedFields(code), productCategory: code.productCategory ?? "", isActive: code.isActive });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  const codes = list.data?.codes ?? [];
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => start("new")} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("defectCodes.new")}
        </button>
      </div>
      <p className="mb-3 text-sm text-neutral-500">{t("defectCodes.intro")}</p>
      {codes.length === 0 ? (
        <EmptyState title={t("defectCodes.emptyTitle")} body={t("defectCodes.emptyBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("defectCodes.code")}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("defectCodes.kind")}</Th>
              <Th>{t("common.category")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id} className={code.isActive ? "" : "opacity-50"}>
                <Td className="font-mono font-bold">{code.code}</Td>
                <Td className="text-left font-semibold">{localizedName(code)}</Td>
                <Td>{t(`defectCodes.kinds.${code.kind}`)}</Td>
                <Td>{code.productCategory ? categoryLabel(code.productCategory) : t("defectCodes.allCategories")}</Td>
                <Td className="text-right">
                  <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => start(code)}>
                    {t("common.edit")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? t("defectCodes.new") : t("defectCodes.edit")}>
        <form className="space-y-4" onSubmit={submit}>
          {editing === "new" ? (
            <Field label={t("defectCodes.kind")}>
              <select className={`${inputClass} bg-white`} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Code["kind"] })}>
                <option value="defect">{t("defectCodes.kinds.defect")}</option>
                <option value="return_reason">{t("defectCodes.kinds.return_reason")}</option>
              </select>
            </Field>
          ) : null}
          <Field label={t("defectCodes.code")}>
            <input className={inputClass} required maxLength={20} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </Field>
          <Field label={t("i18n.nameUz")}>
            <input className={inputClass} required value={form.nameUz} onChange={(event) => setForm({ ...form, nameUz: event.target.value })} />
          </Field>
          <Field label={t("i18n.nameRu")}>
            <input className={inputClass} required value={form.nameRu} onChange={(event) => setForm({ ...form, nameRu: event.target.value })} />
          </Field>
          <Field label={t("i18n.nameEn")}>
            <input className={inputClass} required value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
          </Field>
          {form.kind === "defect" ? (
            <Field label={t("common.category")} hint={t("defectCodes.categoryHint")}>
              <select className={`${inputClass} bg-white`} value={form.productCategory} onChange={(event) => setForm({ ...form, productCategory: event.target.value })}>
                <option value="">{t("defectCodes.allCategories")}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            {t("centers.active")}
          </label>
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={save.isPending} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-70">
              {save.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
