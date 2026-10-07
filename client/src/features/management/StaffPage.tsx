import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatMoney, formatPhone, technicianTypeLabel } from "../../lib/format";
import { categoryLabel } from "../../lib/localized";
import type { ServiceCenter, StaffRole, TechnicianType } from "../../lib/types";

type Row = {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  technicianType: TechnicianType | null;
  isActive: boolean;
  serviceCenterId: string | null;
  payPercent: number;
  payFixedPerJob: number;
  skillCategories: string[];
  baseLat: number | null;
  baseLng: number | null;
  totpEnabled: boolean;
};

const ROLES: StaffRole[] = ["technician", "receptionist", "warehouse", "accountant", "admin"];

/** Add technicians and front-desk staff, set their pay and service center, deactivate leavers, and reset passwords. */
export function StaffPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "technician" as StaffRole, technicianType: "service_center" as TechnicianType, serviceCenterId: "", payPercent: "0", payFixedPerJob: "0", skillCategories: [] as string[], baseLat: "", baseLng: "" });
  const [passwordFor, setPasswordFor] = useState<Row | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["staff", "staff-admin"],
    enabled: Boolean(token),
    queryFn: () => api<{ staff: Row[] }>("/api/staff/staff", { token }),
  });
  const centers = useQuery({
    queryKey: ["staff", "service-centers"],
    enabled: Boolean(token),
    queryFn: () => api<{ centers: ServiceCenter[] }>("/api/staff/service-centers", { token }),
  });
  const categories = useQuery({
    queryKey: ["staff", "categories"],
    enabled: Boolean(token),
    queryFn: () => api<{ categories: string[] }>("/api/staff/catalog/categories", { token }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff"] });
  const resetTwoStep = useMutation({
    mutationFn: (row: Row) => api(`/api/staff/staff/${row.id}/2fa/reset`, { method: "POST", token }),
    onSuccess: async () => {
      notify(t("security.resetDone"));
      await refresh();
    },
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        phone: form.phone,
        role: form.role,
        technicianType: form.role === "technician" ? form.technicianType : null,
        serviceCenterId: form.serviceCenterId || null,
        payPercent: Number(form.payPercent) || 0,
        payFixedPerJob: Number(form.payFixedPerJob) || 0,
        skillCategories: form.role === "technician" ? form.skillCategories : [],
        baseLat: form.baseLat === "" ? null : Number(form.baseLat),
        baseLng: form.baseLng === "" ? null : Number(form.baseLng),
      };
      return editing && editing !== "new"
        ? api(`/api/staff/staff/${editing.id}`, { method: "PATCH", token, body: JSON.stringify(body) })
        : api("/api/staff/staff", { method: "POST", token, body: JSON.stringify({ ...body, password: form.password }) });
    },
    onSuccess: async () => {
      setEditing(null);
      notify(t("staffAdmin.saved"));
      await refresh();
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });
  const toggle = useMutation({
    mutationFn: (row: Row) => api(`/api/staff/staff/${row.id}`, { method: "PATCH", token, body: JSON.stringify({ isActive: !row.isActive }) }),
    onSuccess: refresh,
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });
  const reset = useMutation({
    mutationFn: () => api(`/api/staff/staff/${passwordFor!.id}/password`, { method: "POST", token, body: JSON.stringify({ password: newPassword }) }),
    onSuccess: () => {
      setPasswordFor(null);
      setNewPassword("");
      notify(t("staffAdmin.passwordSaved"));
    },
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });

  function start(row: Row | "new") {
    setEditing(row);
    setError(null);
    setForm(
      row === "new"
        ? { name: "", phone: "", password: "", role: "technician", technicianType: "service_center", serviceCenterId: "", payPercent: "0", payFixedPerJob: "0", skillCategories: [], baseLat: "", baseLng: "" }
        : { name: row.name, phone: row.phone, password: "", role: row.role, technicianType: row.technicianType ?? "service_center", serviceCenterId: row.serviceCenterId ?? "", payPercent: String(row.payPercent), payFixedPerJob: String(row.payFixedPerJob), skillCategories: row.skillCategories ?? [], baseLat: row.baseLat == null ? "" : String(row.baseLat), baseLng: row.baseLng == null ? "" : String(row.baseLng) },
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  if (list.isLoading) return <PageSkeleton />;
  const staff = list.data?.staff ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("staffAdmin.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("staffAdmin.intro")}</p>
        </div>
        <button type="button" onClick={() => start("new")} className="inline-flex h-12 items-center rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white">
          {t("staffAdmin.new")}
        </button>
      </div>
      <SurfaceTable>
        <thead>
          <tr>
            <Th>{t("common.name")}</Th>
            <Th>{t("common.phone")}</Th>
            <Th>{t("staffAdmin.role")}</Th>
            <Th>{t("staffAdmin.pay")}</Th>
            <Th>{t("common.status")}</Th>
            <Th className="text-right">{t("common.actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {staff.map((row) => (
            <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
              <Td className="font-semibold">{row.name}</Td>
              <Td>{formatPhone(row.phone)}</Td>
              <Td>
                {t(`staffAdmin.roles.${row.role}`)}
                {row.technicianType ? <span className="text-neutral-500"> · {technicianTypeLabel(row.technicianType)}</span> : null}
                {row.totpEnabled ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">2FA</span> : null}
                {row.role === "technician" && row.skillCategories.length > 0 ? <span className="block text-xs text-neutral-500">{row.skillCategories.map((name) => categoryLabel(name)).join(", ")}</span> : null}
              </Td>
              <Td>{row.role === "technician" ? `${row.payPercent}% + ${formatMoney(row.payFixedPerJob)}` : t("common.dash")}</Td>
              <Td>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{row.isActive ? t("centers.active") : t("centers.inactive")}</span>
              </Td>
              <Td className="text-right">
                <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => start(row)}>
                  {t("common.edit")}
                </button>
                <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => { setPasswordFor(row); setNewPassword(""); }}>
                  {t("staffAdmin.resetPassword")}
                </button>
                {row.totpEnabled && row.id !== user?.id ? (
                  <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#7B00E0]" onClick={() => window.confirm(t("security.resetConfirm", { name: row.name })) && resetTwoStep.mutate(row)}>
                    {t("security.reset")}
                  </button>
                ) : null}
                {row.id !== user?.id ? (
                  <button type="button" className={`text-sm font-semibold ${row.isActive ? "text-red-600" : "text-emerald-700"}`} onClick={() => toggle.mutate(row)}>
                    {row.isActive ? t("staffAdmin.deactivate") : t("staffAdmin.activate")}
                  </button>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </SurfaceTable>

      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? t("staffAdmin.new") : t("staffAdmin.edit")}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label={t("common.name")}>
            <input className={inputClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} />
          </Field>
          <Field label={t("common.phone")}>
            <input className={inputClass} required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          {editing === "new" ? (
            <Field label={t("staffAdmin.password")} hint={t("staffAdmin.passwordHint")}>
              <input className={inputClass} required minLength={8} type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="off" />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("staffAdmin.role")}>
              <select className={`${inputClass} bg-white`} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffRole })}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`staffAdmin.roles.${role}`)}
                  </option>
                ))}
              </select>
            </Field>
            {form.role === "technician" ? (
              <Field label={t("staffAdmin.technicianType")}>
                <select className={`${inputClass} bg-white`} value={form.technicianType} onChange={(event) => setForm({ ...form, technicianType: event.target.value as TechnicianType })}>
                  <option value="service_center">{t("techType.service_center")}</option>
                  <option value="mobile">{t("techType.mobile")}</option>
                </select>
              </Field>
            ) : null}
          </div>
          {form.role !== "admin" ? (
            <Field label={t("centers.center")}>
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
          {form.role === "technician" ? (
            <>
              <Field label={t("staffAdmin.skills")} hint={t("staffAdmin.skillsHint")}>
                <div className="flex flex-wrap gap-2">
                  {(categories.data?.categories ?? []).map((name) => {
                    const on = form.skillCategories.includes(name);
                    return (
                      <button key={name} type="button" onClick={() => setForm({ ...form, skillCategories: on ? form.skillCategories.filter((item) => item !== name) : [...form.skillCategories, name] })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-[#7B00E0] bg-[#F5EBFD] text-[#7B00E0]" : "border-neutral-300 text-neutral-600"}`}>
                        {categoryLabel(name)}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("staffAdmin.baseLat")} hint={t("staffAdmin.baseHint")}>
                  <input className={inputClass} type="number" step="any" min={-90} max={90} value={form.baseLat} onChange={(event) => setForm({ ...form, baseLat: event.target.value })} />
                </Field>
                <Field label={t("staffAdmin.baseLng")}>
                  <input className={inputClass} type="number" step="any" min={-180} max={180} value={form.baseLng} onChange={(event) => setForm({ ...form, baseLng: event.target.value })} />
                </Field>
              </div>
            </>
          ) : null}
          {form.role === "technician" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("staffAdmin.payPercent")} hint={t("staffAdmin.payPercentHint")}>
                <input className={inputClass} type="number" min={0} max={100} step="0.5" value={form.payPercent} onChange={(event) => setForm({ ...form, payPercent: event.target.value })} />
              </Field>
              <Field label={t("staffAdmin.payFixed")} hint={t("staffAdmin.payFixedHint")}>
                <input className={inputClass} type="number" min={0} step={1} value={form.payFixedPerJob} onChange={(event) => setForm({ ...form, payFixedPerJob: event.target.value })} />
              </Field>
            </div>
          ) : null}
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

      <Modal open={Boolean(passwordFor)} onClose={() => setPasswordFor(null)} title={t("staffAdmin.resetPassword")}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            reset.mutate();
          }}
        >
          <p className="text-sm text-neutral-600">{t("staffAdmin.resetFor", { name: passwordFor?.name ?? "" })}</p>
          <Field label={t("staffAdmin.password")} hint={t("staffAdmin.passwordHint")}>
            <input className={inputClass} required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPasswordFor(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={reset.isPending || newPassword.length < 8} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-50">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
