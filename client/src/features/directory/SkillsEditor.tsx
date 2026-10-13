import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { inputClass } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { api, apiErrorMessage } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { DirBrand, DirModel } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { useBrands, useModels } from "./useDirectory";

type Skills = { brands: DirBrand[]; models: DirModel[] };

/** The "I repair" list: whole brands or single models of other makers. RIZO products and warranty jobs need no entry. */
export function SkillsEditor({ staffId }: { staffId?: string }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const client = useQueryClient();
  const key = ["staff", "directory", "skills", staffId ?? "me"];
  const skills = useQuery({ queryKey: key, enabled: Boolean(token), queryFn: () => api<Skills>(`/api/staff/directory/skills${staffId ? `?staffId=${encodeURIComponent(staffId)}` : ""}`, { token }) });
  const brands = useBrands();
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = useModels({ brandId }, Boolean(brandId));

  const save = useMutation({
    mutationFn: (next: { brandIds: string[]; productIds: string[] }) => api<Skills>("/api/staff/directory/skills", { method: "PUT", token, body: JSON.stringify({ staffId, ...next }) }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      setError(null);
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  const current = skills.data ?? { brands: [], models: [] };
  const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);
  const addBrand = (id: string) => save.mutate({ brandIds: [...new Set([...ids(current.brands), id])], productIds: ids(current.models) });
  const addModel = (id: string) => save.mutate({ brandIds: ids(current.brands), productIds: [...new Set([...ids(current.models), id])] });
  const options = (brands.data?.brands ?? []).filter((brand) => !brand.isOwn);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">{t("directory.skillsIntro")}</p>
      {skills.isLoading ? <Spinner /> : null}
      <div className="flex flex-wrap gap-2">
        {current.brands.map((brand) => (
          <Chip key={brand.id} label={`${brand.name} · ${t("directory.allModels")}`} pending={!brand.approved} onRemove={() => save.mutate({ brandIds: ids(current.brands).filter((id) => id !== brand.id), productIds: ids(current.models) })} />
        ))}
        {current.models.map((model) => (
          <Chip key={model.id} label={`${model.name} · ${categoryLabel(model.category)}`} pending={!model.approved} onRemove={() => save.mutate({ brandIds: ids(current.brands), productIds: ids(current.models).filter((id) => id !== model.id) })} />
        ))}
        {current.brands.length + current.models.length === 0 && !skills.isLoading ? <p className="text-sm text-neutral-400">{t("directory.skillsEmpty")}</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select className={inputClass} value={brandId} onChange={(event) => { setBrandId(event.target.value); setModelId(""); }}>
          <option value="">{t("directory.chooseBrand")}</option>
          {options.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
              {brand.approved ? "" : ` (${t("directory.pending")})`}
            </option>
          ))}
        </select>
        <select className={inputClass} value={modelId} disabled={!brandId} onChange={(event) => setModelId(event.target.value)}>
          <option value="">{t("directory.allModelsOfBrand")}</option>
          {(models.data?.models ?? []).map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} · {categoryLabel(model.category)}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!brandId || save.isPending}
          onClick={() => {
            if (modelId) addModel(modelId);
            else addBrand(brandId);
            setBrandId("");
            setModelId("");
          }}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#7B00E0] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus size={16} />
          {t("directory.addToList")}
        </button>
      </div>
      <button type="button" onClick={() => setAdding(true)} className="text-sm font-semibold text-[#7B00E0] hover:underline">
        {t("directory.notInList")}
      </button>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {adding ? <AddDeviceDialog open onClose={() => setAdding(false)} onAdded={(model) => addModel(model.id)} /> : null}
    </div>
  );
}

function Chip({ label, pending, onRemove }: { label: string; pending: boolean; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${pending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[#7B00E0]/20 bg-[#F5EBFD] text-[#5A00A8]"}`}>
      {label}
      {pending ? <span className="text-xs font-bold">· {t("directory.pending")}</span> : null}
      <button type="button" onClick={onRemove} aria-label={t("common.remove")} className="rounded-full p-0.5 hover:bg-black/10">
        <X size={14} />
      </button>
    </span>
  );
}
