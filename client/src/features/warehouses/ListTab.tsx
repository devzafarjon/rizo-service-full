import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { Spinner } from "../../components/Spinner";
import { useToast } from "../../components/toast";
import { api, apiErrorMessage } from "../../lib/api";
import { regionLabel, UZBEKISTAN_REGIONS } from "../../lib/regions";
import type { ServiceCenter, Warehouse } from "../../lib/types";
import { useStaffAuth } from "../auth/StaffAuthContext";

const EMPTY = { name: "", kind: "regional" as "regional" | "branch", regionCode: "01", address: "", phone: "", serviceCenterId: "", leadDaysSameRegion: "1", leadDaysOtherRegion: "3", note: "", isActive: true };

/** Admin: all warehouses of the network - add, edit, switch off, link a branch warehouse to its service centre. */
export function ListTab({ warehouses, onOpen }: { warehouses: Warehouse[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const centers = useQuery({
    queryKey: ["staff", "service-centers"],
    enabled: Boolean(token),
    queryFn: () => api<{ centers: ServiceCenter[] }>("/api/staff/service-centers", { token }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name: form.name,
        kind: form.kind,
        regionCode: form.regionCode,
        address: form.address || null,
        phone: form.phone || null,
        serviceCenterId: form.kind === "branch" ? form.serviceCenterId || null : null,
        leadDaysSameRegion: Number(form.leadDaysSameRegion) || 0,
        leadDaysOtherRegion: Number(form.leadDaysOtherRegion) || 0,
        note: form.note || null,
        ...(editing !== "new" ? { isActive: form.isActive } : {}),
      });
      return editing && editing !== "new" ? api(`/api/staff/warehouses/${editing.id}`, { method: "PATCH", token, body }) : api("/api/staff/warehouses", { method: "POST", token, body });
    },
    onSuccess: async () => {
      setEditing(null);
      notify(t("warehouse.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "warehouses"] });
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  function start(row: Warehouse | "new") {
    setEditing(row);
    setError(null);
    setForm(
      row === "new"
        ? EMPTY
        : { name: row.name, kind: row.kind === "central" ? "regional" : row.kind, regionCode: row.regionCode, address: row.address ?? "", phone: row.phone ?? "", serviceCenterId: row.serviceCenterId ?? "", leadDaysSameRegion: String(row.leadDaysSameRegion), leadDaysOtherRegion: String(row.leadDaysOtherRegion), note: row.note ?? "", isActive: row.isActive },
    );
  }
  const isCentral = editing !== null && editing !== "new" && editing.kind === "central";

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => start("new")} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("warehouse.new")}
        </button>
      </div>
      <SurfaceTable>
        <thead>
          <tr>
            <Th>{t("common.name")}</Th>
            <Th>{t("warehouse.kindLabel")}</Th>
            <Th>{t("common.region")}</Th>
            <Th>{t("warehouse.units")}</Th>
            <Th>{t("warehouse.keepers")}</Th>
            <Th>{t("warehouse.eta")}</Th>
            <Th className="text-right">{t("common.actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {warehouses.map((row) => (
            <tr key={row.id} className={row.isActive ? "" : "opacity-55"}>
              <Td className="font-semibold">
                <button type="button" className="text-left hover:text-[#7B00E0]" onClick={() => onOpen(row.id)}>
                  {row.name}
                </button>
                {row.serviceCenterName ? <span className="block text-xs font-normal text-neutral-500">{row.serviceCenterName}</span> : null}
                {!row.isActive ? <span className="block text-xs font-normal text-red-600">{t("warehouse.off")}</span> : null}
              </Td>
              <Td>{t(`warehouse.kind.${row.kind}`)}</Td>
              <Td>{regionLabel(row.regionCode)}</Td>
              <Td>{row.units}</Td>
              <Td className="whitespace-normal text-xs">{row.keepers.length ? row.keepers.map((keeper) => keeper.name).join(", ") : t("common.dash")}</Td>
              <Td className="whitespace-normal text-xs">{t("warehouse.etaShort", { same: row.leadDaysSameRegion, other: row.leadDaysOtherRegion })}</Td>
              <Td className="text-right">
                <button type="button" className="text-sm font-semibold text-[#7B00E0]" onClick={() => start(row)}>
                  {t("common.edit")}
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </SurfaceTable>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("warehouse.new") : t("warehouse.edit")}>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <Field label={t("common.name")}>
            <input className={inputClass} required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          {!isCentral ? (
            <Field label={t("warehouse.kindLabel")}>
              <select className={`${inputClass} bg-white`} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as "regional" | "branch" })}>
                <option value="regional">{t("warehouse.kind.regional")}</option>
                <option value="branch">{t("warehouse.kind.branch")}</option>
              </select>
            </Field>
          ) : null}
          <Field label={t("common.region")}>
            <select className={`${inputClass} bg-white`} value={form.regionCode} onChange={(event) => setForm({ ...form, regionCode: event.target.value })}>
              {UZBEKISTAN_REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {regionLabel(region.code)}
                </option>
              ))}
            </select>
          </Field>
          {form.kind === "branch" && !isCentral ? (
            <Field label={t("warehouse.serviceCenter")} hint={t("warehouse.serviceCenterHint")}>
              <select className={`${inputClass} bg-white`} value={form.serviceCenterId} onChange={(event) => setForm({ ...form, serviceCenterId: event.target.value })}>
                <option value="">{t("common.dash")}</option>
                {(centers.data?.centers ?? []).map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("warehouse.daysSame")} hint={t("warehouse.daysHint")}>
              <input className={inputClass} type="number" min={0} max={60} required value={form.leadDaysSameRegion} onChange={(event) => setForm({ ...form, leadDaysSameRegion: event.target.value })} />
            </Field>
            <Field label={t("warehouse.daysOther")}>
              <input className={inputClass} type="number" min={0} max={60} required value={form.leadDaysOtherRegion} onChange={(event) => setForm({ ...form, leadDaysOtherRegion: event.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.address")}>
              <input className={inputClass} maxLength={200} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label={t("common.phone")}>
              <input className={inputClass} maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
          </div>
          <Field label={t("payments.note")}>
            <input className={inputClass} maxLength={300} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
          {editing !== "new" && !isCentral ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              {t("warehouse.active")}
            </label>
          ) : null}
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
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
