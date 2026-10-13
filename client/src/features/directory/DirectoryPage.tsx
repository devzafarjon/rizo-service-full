import { useState } from "react";
import { Check, ChevronDown, ChevronRight, GitMerge, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { apiErrorMessage } from "../../lib/api";
import { categoryLabel } from "../../lib/localized";
import type { DirBrand, DirModel } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { useBrands, useDirectoryActions, useModels } from "./useDirectory";

type Action =
  | { kind: "rename"; target: "brand" | "model"; id: string; name: string }
  | { kind: "merge"; target: "brand" | "model"; id: string; name: string }
  | { kind: "delete"; target: "brand" | "model"; id: string; name: string };

const pill = "inline-flex rounded-full px-2.5 py-1 text-xs font-bold";

export function DirectoryPage() {
  const { t } = useTranslation();
  const { user } = useStaffAuth();
  const isAdmin = user?.role === "admin";
  const { notify } = useToast();
  const brands = useBrands();
  const pending = useModels({ pending: true }, isAdmin);
  const actions = useDirectoryActions();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      setAction(null);
    } catch (err) {
      notify(apiErrorMessage(err, t), "error");
    }
  }

  if (brands.isLoading) return <PageSkeleton />;
  const list = brands.data?.brands ?? [];
  const waitingBrands = list.filter((brand) => !brand.approved);
  const waitingModels = (pending.data?.models ?? []).filter((model) => model.brandId && !waitingBrands.some((brand) => brand.id === model.brandId));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("directory.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("directory.intro")}</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#7B00E0] px-4 text-sm font-semibold text-white">
          <Plus size={16} />
          {t("directory.addDevice")}
        </button>
      </div>

      {isAdmin && (waitingBrands.length > 0 || waitingModels.length > 0) ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-extrabold text-amber-900">{t("directory.waitingTitle", { count: waitingBrands.length + waitingModels.length })}</h2>
          <ul className="mt-3 space-y-2">
            {waitingBrands.map((brand) => (
              <li key={brand.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                <span className="text-sm font-semibold">
                  {t("directory.brand")}: {brand.name} <span className="font-normal text-neutral-500">· {brand.addedByName}</span>
                  {brand.pendingModels ? <span className="font-normal text-neutral-500"> · {t("directory.withModels", { count: brand.pendingModels })}</span> : null}
                </span>
                <Buttons onApprove={() => run(() => actions.approveBrand(brand.id))} onDelete={() => setAction({ kind: "delete", target: "brand", id: brand.id, name: brand.name })} />
              </li>
            ))}
            {waitingModels.map((model) => (
              <li key={model.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                <span className="text-sm font-semibold">
                  {t("directory.model")}: {model.name} <span className="font-normal text-neutral-500">· {categoryLabel(model.category)} · {model.addedByName}</span>
                </span>
                <Buttons onApprove={() => run(() => actions.approveModel(model.id))} onDelete={() => setAction({ kind: "delete", target: "model", id: model.id, name: model.name })} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 space-y-2">
        {list.length === 0 ? <EmptyState title={t("directory.empty")} /> : null}
        {list.map((brand) => (
          <BrandRow
            key={brand.id}
            brand={brand}
            expanded={open === brand.id}
            isAdmin={isAdmin}
            onToggle={() => setOpen(open === brand.id ? null : brand.id)}
            onAction={setAction}
            onApproveModel={(id) => run(() => actions.approveModel(id))}
            onApproveBrand={() => run(() => actions.approveBrand(brand.id))}
          />
        ))}
      </section>

      {adding ? <AddDeviceDialog open onClose={() => setAdding(false)} /> : null}
      {action?.kind === "rename" ? (
        <RenameDialog action={action} onClose={() => setAction(null)} onSave={(name) => run(() => (action.target === "brand" ? actions.renameBrand(action.id, name) : actions.renameModel(action.id, name)))} />
      ) : null}
      {action?.kind === "merge" ? (
        <MergeDialog action={action} brands={list} onClose={() => setAction(null)} onSave={(intoId) => run(() => (action.target === "brand" ? actions.mergeBrand(action.id, intoId) : actions.mergeModel(action.id, intoId)))} />
      ) : null}
      <ConfirmDialog
        open={action?.kind === "delete"}
        title={t("directory.deleteTitle")}
        body={t("directory.deleteBody", { name: action?.name ?? "" })}
        confirmLabel={t("directory.delete")}
        onClose={() => setAction(null)}
        onConfirm={() => action && run(() => (action.target === "brand" ? actions.deleteBrand(action.id) : actions.deleteModel(action.id)))}
      />
    </div>
  );
}

function Buttons({ onApprove, onDelete }: { onApprove: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-2">
      <button type="button" onClick={onApprove} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">
        <Check size={14} />
        {t("directory.approve")}
      </button>
      <button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
        <Trash2 size={14} />
        {t("directory.reject")}
      </button>
    </span>
  );
}

function BrandRow({
  brand,
  expanded,
  isAdmin,
  onToggle,
  onAction,
  onApproveModel,
  onApproveBrand,
}: {
  brand: DirBrand;
  expanded: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onAction: (action: Action) => void;
  onApproveModel: (id: string) => void;
  onApproveBrand: () => void;
}) {
  const { t } = useTranslation();
  const models = useModels({ brandId: brand.id }, expanded);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <button type="button" onClick={onToggle} className="flex min-h-10 flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span className="text-base font-extrabold">{brand.name}</span>
          {brand.isOwn ? <span className={`${pill} bg-[#F5EBFD] text-[#7B00E0]`}>{t("directory.own")}</span> : null}
          {!brand.approved ? <span className={`${pill} bg-amber-50 text-amber-800`}>{t("directory.pending")}</span> : null}
          <span className="text-sm text-neutral-500">{t("directory.modelCount", { count: brand.modelCount ?? 0 })}</span>
        </button>
        {isAdmin && !brand.isOwn ? (
          <span className="flex gap-1">
            {!brand.approved ? (
              <button type="button" onClick={onApproveBrand} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">
                <Check size={14} />
                {t("directory.approve")}
              </button>
            ) : null}
            <IconButton label={t("directory.rename")} onClick={() => onAction({ kind: "rename", target: "brand", id: brand.id, name: brand.name })}>
              <Pencil size={15} />
            </IconButton>
            <IconButton label={t("directory.merge")} onClick={() => onAction({ kind: "merge", target: "brand", id: brand.id, name: brand.name })}>
              <GitMerge size={15} />
            </IconButton>
            <IconButton label={t("directory.delete")} onClick={() => onAction({ kind: "delete", target: "brand", id: brand.id, name: brand.name })}>
              <Trash2 size={15} />
            </IconButton>
          </span>
        ) : null}
      </div>
      {expanded ? (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {(models.data?.models ?? []).map((model: DirModel) => (
            <li key={model.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="text-sm">
                <span className="font-semibold">{model.name}</span>
                <span className="text-neutral-500"> · {categoryLabel(model.category)}</span>
                {!model.isOwn ? <span className="text-neutral-400"> · {t("directory.requestsCount", { count: model.requestsCount ?? 0 })}</span> : null}
                {!model.approved ? <span className={`${pill} ml-2 bg-amber-50 text-amber-800`}>{t("directory.pending")}</span> : null}
                {model.addedByName ? <span className="text-neutral-400"> · {model.addedByName}</span> : null}
              </span>
              {isAdmin && !model.isOwn ? (
                <span className="flex gap-1">
                  {!model.approved ? (
                    <IconButton label={t("directory.approve")} onClick={() => onApproveModel(model.id)}>
                      <Check size={15} />
                    </IconButton>
                  ) : null}
                  <IconButton label={t("directory.rename")} onClick={() => onAction({ kind: "rename", target: "model", id: model.id, name: model.name })}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton label={t("directory.merge")} onClick={() => onAction({ kind: "merge", target: "model", id: model.id, name: model.name })}>
                    <GitMerge size={15} />
                  </IconButton>
                  <IconButton label={t("directory.delete")} onClick={() => onAction({ kind: "delete", target: "model", id: model.id, name: model.name })}>
                    <Trash2 size={15} />
                  </IconButton>
                </span>
              ) : null}
            </li>
          ))}
          {models.isSuccess && (models.data?.models.length ?? 0) === 0 ? <li className="px-4 py-3 text-sm text-neutral-400">{t("directory.noModels")}</li> : null}
          {brand.isOwn ? <li className="px-4 py-2 text-xs text-neutral-400">{t("directory.ownNote")}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100">
      {children}
    </button>
  );
}

function RenameDialog({ action, onClose, onSave }: { action: Action; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(action.name);
  return (
    <Modal open onClose={onClose} title={t("directory.rename")}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(name); }} className="space-y-4">
        <Field label={t(action.target === "brand" ? "directory.brand" : "directory.model")}>
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">{t("common.cancel")}</button>
          <button type="submit" className="inline-flex h-11 items-center rounded-xl bg-[#7B00E0] px-5 text-sm font-semibold text-white">{t("directory.save")}</button>
        </div>
      </form>
    </Modal>
  );
}

function MergeDialog({ action, brands, onClose, onSave }: { action: Action; brands: DirBrand[]; onClose: () => void; onSave: (intoId: string) => void }) {
  const { t } = useTranslation();
  const [intoId, setIntoId] = useState("");
  const [brandId, setBrandId] = useState("");
  const models = useModels({ brandId }, action.target === "model" && Boolean(brandId));
  const options = action.target === "brand" ? brands.filter((brand) => brand.id !== action.id) : (models.data?.models ?? []).filter((model) => model.id !== action.id && !model.isOwn);
  return (
    <Modal open onClose={onClose} title={t("directory.mergeTitle", { name: action.name })}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(intoId); }} className="space-y-4">
        <p className="text-sm text-neutral-500">{t("directory.mergeBody")}</p>
        {action.target === "model" ? (
          <Field label={t("directory.brand")}>
            <select className={inputClass} value={brandId} onChange={(event) => { setBrandId(event.target.value); setIntoId(""); }} required>
              <option value="">{t("directory.chooseBrand")}</option>
              {brands.filter((brand) => !brand.isOwn).map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={t("directory.mergeInto")}>
          <select className={inputClass} value={intoId} onChange={(event) => setIntoId(event.target.value)} required>
            <option value="">—</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">{t("common.cancel")}</button>
          <button type="submit" disabled={!intoId} className="inline-flex h-11 items-center rounded-xl bg-[#7B00E0] px-5 text-sm font-semibold text-white disabled:opacity-50">{t("directory.merge")}</button>
        </div>
      </form>
    </Modal>
  );
}
