import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { categoryLabel } from "../../lib/localized";
import type { DirModel } from "../../lib/types";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { useBrands, useCategories, useModels } from "./useDirectory";

/** Category, then brand, then model of a device by another maker. Models still waiting for approval are shown but cannot be chosen. */
export function OtherDevicePicker({ value, onChange }: { value: DirModel | null; onChange: (model: DirModel | null) => void }) {
  const { t } = useTranslation();
  const categories = useCategories();
  const brands = useBrands();
  const [category, setCategory] = useState(value?.category ?? "");
  const [brandId, setBrandId] = useState(value?.brandId ?? "");
  const [adding, setAdding] = useState(false);
  const models = useModels({ brandId, category }, Boolean(brandId && category));
  const brandOptions = (brands.data?.brands ?? []).filter((brand) => !brand.isOwn && (!category || brand.categories?.includes(category) || brand.approved === false));
  const list = models.data?.models ?? [];

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("directory.category")}>
          <select className={inputClass} value={category} onChange={(event) => { setCategory(event.target.value); setBrandId(""); onChange(null); }}>
            <option value="">{t("directory.chooseCategory")}</option>
            {(categories.data?.categories ?? []).map((name) => (
              <option key={name} value={name}>{categoryLabel(name)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("directory.brand")}>
          <select className={inputClass} value={brandId} disabled={!category} onChange={(event) => { setBrandId(event.target.value); onChange(null); }}>
            <option value="">{t("directory.chooseBrand")}</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.id}>{brand.name}{brand.approved ? "" : ` (${t("directory.pending")})`}</option>
            ))}
          </select>
        </Field>
        <Field label={t("directory.model")}>
          <select className={inputClass} value={value?.id ?? ""} disabled={!brandId} onChange={(event) => onChange(list.find((model) => model.id === event.target.value) ?? null)}>
            <option value="">{t("directory.chooseModel")}</option>
            {list.map((model) => (
              <option key={model.id} value={model.id} disabled={!model.approved}>{model.name}{model.approved ? "" : ` (${t("directory.pending")})`}</option>
            ))}
          </select>
        </Field>
      </div>
      <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#7B00E0] hover:underline">
        <Plus size={14} />
        {t("directory.notInList")}
      </button>
      <p className="text-xs text-neutral-500">{t("directory.otherMakerNote")}</p>
      {adding ? (
        <AddDeviceDialog
          open
          presetBrandId={brandId || undefined}
          presetCategory={category || undefined}
          onClose={() => setAdding(false)}
          onAdded={(model) => {
            setCategory(model.category);
            setBrandId(model.brandId);
            if (model.approved) onChange(model);
          }}
        />
      ) : null}
    </div>
  );
}
