import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { UZBEKISTAN_REGIONS, regionLabel } from "../../lib/regions";
import type { ServiceCenter } from "../../lib/types";

const EMPTY = { name: "", regionCode: "01", address: "", phone: "", workingHours: "", lat: "", lng: "", isAuthorized: true, isActive: true };

/** Where customers can bring a device. Also published on the public centers page. */
export function ServiceCentersPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ServiceCenter | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";

  const list = useQuery({
    queryKey: ["staff", "service-centers"],
    enabled: Boolean(token),
    queryFn: () => api<{ centers: ServiceCenter[] }>("/api/staff/service-centers", { token }),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        ...form,
        phone: form.phone || null,
        workingHours: form.workingHours || null,
        lat: form.lat === "" ? null : Number(form.lat),
        lng: form.lng === "" ? null : Number(form.lng),
      });
      return editing && editing !== "new"
        ? api(`/api/staff/service-centers/${editing.id}`, { method: "PATCH", token, body })
        : api("/api/staff/service-centers", { method: "POST", token, body });
    },
    onSuccess: async () => {
      setEditing(null);
      notify(t("centers.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "service-centers"] });
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  function start(center: ServiceCenter | "new") {
    setEditing(center);
    setError(null);
    setForm(center === "new" ? EMPTY : { name: center.name, regionCode: center.regionCode, address: center.address, phone: center.phone ?? "", workingHours: center.workingHours ?? "", lat: center.lat == null ? "" : String(center.lat), lng: center.lng == null ? "" : String(center.lng), isAuthorized: center.isAuthorized, isActive: center.isActive });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  if (list.isLoading) return <PageSkeleton />;
  const centers = list.data?.centers ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("centers.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("centers.intro")}</p>
        </div>
        {isAdmin ? (
          <button type="button" onClick={() => start("new")} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
            {t("centers.new")}
          </button>
        ) : null}
      </div>
      {centers.length === 0 ? (
        <EmptyState title={t("centers.emptyTitle")} body={t("centers.emptyBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("centers.name")}</Th>
              <Th>{t("common.region")}</Th>
              <Th>{t("common.address")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{t("centers.hours")}</Th>
              <Th>{t("common.status")}</Th>
              {isAdmin ? <Th className="text-right">{t("common.actions")}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {centers.map((center) => (
              <tr key={center.id}>
                <Td className="font-semibold">{center.name}</Td>
                <Td>{regionLabel(center.regionCode)}</Td>
                <Td className="max-w-xs truncate">{center.address}</Td>
                <Td>{center.phone ?? t("common.dash")}</Td>
                <Td>{center.workingHours ?? t("common.dash")}</Td>
                <Td>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${center.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{center.isActive ? t("centers.active") : t("centers.inactive")}</span>
                  {center.isAuthorized ? <span className="ml-1 rounded-full bg-[#F5EBFD] px-2.5 py-1 text-xs font-bold text-[#7B00E0]">{t("centers.authorized")}</span> : null}
                </Td>
                {isAdmin ? (
                  <Td className="text-right">
                    <button type="button" className="text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => start(center)}>
                      {t("common.edit")}
                    </button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? t("centers.new") : t("centers.edit")}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t("centers.name")}>
            <input className={inputClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} />
          </Field>
          <Field label={t("common.region")}>
            <select className={`${inputClass} bg-white`} value={form.regionCode} onChange={(event) => setForm({ ...form, regionCode: event.target.value })}>
              {UZBEKISTAN_REGIONS.map((region) => (
                <option key={region.code} value={region.code}>
                  {regionLabel(region.code)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("common.address")}>
            <input className={inputClass} required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.phone")}>
              <input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} />
            </Field>
            <Field label={t("centers.hours")}>
              <input className={inputClass} value={form.workingHours} onChange={(event) => setForm({ ...form, workingHours: event.target.value })} maxLength={100} />
            </Field>
            <Field label={t("centers.lat")}>
              <input className={inputClass} type="number" step="any" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} />
            </Field>
            <Field label={t("centers.lng")}>
              <input className={inputClass} type="number" step="any" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isAuthorized} onChange={(event) => setForm({ ...form, isAuthorized: event.target.checked })} />
              {t("centers.authorized")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              {t("centers.active")}
            </label>
          </div>
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
