import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { apiErrorMessage } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { DirBrand, DirModel } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { similarOf, useBrands, useCategories, useDirectoryActions, type Similar } from "./useDirectory";

const sameName = (a: string, b: string) => a.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === b.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Adds a model of another maker: brand (existing or new), category and model. A near-duplicate name is shown first
 * ("did you mean Samsung?") and only added when the person insists. Everything except an admin's own entry waits for approval.
 */
export function AddDeviceDialog({
  open,
  onClose,
  onAdded,
  presetBrandId,
  presetCategory,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (model: DirModel) => void;
  presetBrandId?: string;
  presetCategory?: string;
}) {
  const { t } = useTranslation();
  const { user } = useStaffAuth();
  const role = user?.role;
  const brands = useBrands();
  const categories = useCategories();
  const actions = useDirectoryActions();
  const others = (brands.data?.brands ?? []).filter((brand) => !brand.isOwn);
  const [brandName, setBrandName] = useState(() => others.find((brand) => brand.id === presetBrandId)?.name ?? "");
  const [category, setCategory] = useState(presetCategory ?? "");
  const [model, setModel] = useState("");
  const [similar, setSimilar] = useState<{ kind: "brand" | "model"; items: Similar } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event?: FormEvent, force = false) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const existing = others.find((brand) => sameName(brand.name, brandName));
      let brand: DirBrand | undefined = existing;
      if (!brand) {
        try {
          brand = (await actions.addBrand(brandName, force)).brand;
        } catch (err) {
          const items = similarOf(err, "similarBrand");
          if (items) {
            setSimilar({ kind: "brand", items });
            return;
          }
          throw err;
        }
      }
      try {
        const done = await actions.addModel({ brandId: brand.id, category, model, force });
        onAdded?.(done.model);
        setModel("");
        setSimilar(null);
        onClose();
      } catch (err) {
        const items = similarOf(err, "similarModel");
        if (items) {
          setSimilar({ kind: "model", items });
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("directory.addDevice")}>
      <form onSubmit={(event) => save(event)} className="space-y-4">
        <p className="text-sm text-neutral-500">{role === "admin" ? t("directory.addHintAdmin") : t("directory.addHint")}</p>
        <Field label={t("directory.brand")}>
          <input className={inputClass} list="directory-brands" value={brandName} onChange={(event) => { setBrandName(event.target.value); setSimilar(null); }} required maxLength={60} placeholder={t("directory.brandPlaceholder")} />
        </Field>
        <datalist id="directory-brands">
          {others.map((brand) => (
            <option key={brand.id} value={brand.name} />
          ))}
        </datalist>
        <Field label={t("directory.category")}>
          <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)} required>
            <option value="">{t("directory.chooseCategory")}</option>
            {(categories.data?.categories ?? []).map((name) => (
              <option key={name} value={name}>
                {categoryLabel(name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("directory.model")}>
          <input className={inputClass} value={model} onChange={(event) => { setModel(event.target.value); setSimilar(null); }} required maxLength={80} placeholder={t("directory.modelPlaceholder")} />
        </Field>
        {similar ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{t(similar.kind === "brand" ? "directory.similarBrand" : "directory.similarModel")}</p>
            <ul className="mt-1 list-disc pl-5">
              {similar.items.map((item) => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
            <p className="mt-2">{t("directory.similarHint")}</p>
            <button type="button" onClick={() => save(undefined, true)} className="mt-2 inline-flex h-10 items-center rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white">
              {t("directory.addAnyway")}
            </button>
          </div>
        ) : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#7B00E0] px-5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Spinner /> : null}
            {t("directory.add")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
