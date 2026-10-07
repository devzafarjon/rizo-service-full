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
import { formatStamp } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import type { SparePart, StockMovement, TechnicianStockOverview } from "../../lib/types";

type MoveForm = { mode: "issue" | "return"; technicianId: string; sparePartId: string; quantity: string; note: string };

/** The parts each technician carries. The warehouse hands parts out and takes unused ones back. */
export function TechStockPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MoveForm | null>(null);

  const overview = useQuery({
    queryKey: ["staff", "tech-stock"],
    enabled: Boolean(token),
    queryFn: () => api<{ technicians: TechnicianStockOverview[] }>("/api/staff/tech-stock", { token }),
  });
  const movements = useQuery({
    queryKey: ["staff", "tech-stock", "movements"],
    enabled: Boolean(token),
    queryFn: () => api<{ movements: StockMovement[] }>("/api/staff/tech-stock/movements", { token }),
  });
  const parts = useQuery({
    queryKey: ["staff", "parts"],
    enabled: Boolean(token),
    queryFn: () => api<{ parts: SparePart[] }>("/api/staff/catalog/parts", { token }),
  });

  const move = useMutation({
    mutationFn: (value: MoveForm) =>
      api(`/api/staff/tech-stock/${value.mode}`, {
        method: "POST",
        token,
        body: JSON.stringify({ technicianId: value.technicianId, sparePartId: value.sparePartId, quantity: Number(value.quantity), note: value.note || null }),
      }),
    onSuccess: async () => {
      setForm(null);
      notify(t("techStock.saved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "tech-stock"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (overview.isLoading) return <PageSkeleton />;
  const technicians = overview.data?.technicians ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form) move.mutate(form);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("techStock.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("techStock.intro")}</p>
        </div>
        <button type="button" className="btn-rizo" onClick={() => setForm({ mode: "issue", technicianId: technicians[0]?.id ?? "", sparePartId: "", quantity: "1", note: "" })}>
          {t("techStock.issue")}
        </button>
      </div>

      {technicians.length === 0 ? (
        <EmptyState title={t("techStock.noTechnicians")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {technicians.map((tech) => (
            <section key={tech.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-neutral-900">{tech.name}</h2>
                  <p className="text-xs text-neutral-500">{t("techStock.carrying", { count: tech.total })}</p>
                </div>
                <button type="button" className="text-xs font-bold text-[#7B00E0] hover:underline" onClick={() => setForm({ mode: "return", technicianId: tech.id, sparePartId: tech.items[0]?.sparePartId ?? "", quantity: "1", note: "" })} disabled={tech.items.length === 0}>
                  {t("techStock.takeBack")}
                </button>
              </div>
              {tech.items.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">{t("techStock.nothing")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-neutral-100 text-sm">
                  {tech.items.map((item) => (
                    <li key={item.sparePartId} className="flex items-center justify-between py-1.5">
                      <span className="font-semibold">{localizedName(item)}</span>
                      <span className="rounded-full bg-[#F5EBFD] px-2.5 py-0.5 text-xs font-bold text-[#7B00E0]">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 text-xs font-bold tracking-wide text-neutral-500 uppercase">{t("techStock.recent")}</h2>
      {(movements.data?.movements ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500">{t("techStock.noMoves")}</p>
      ) : (
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("common.date")}</Th>
              <Th>{t("techStock.technician")}</Th>
              <Th>{t("catalog.part")}</Th>
              <Th>{t("techStock.what")}</Th>
              <Th>{t("common.qty")}</Th>
              <Th>{t("techStock.by")}</Th>
            </tr>
          </thead>
          <tbody>
            {(movements.data?.movements ?? []).map((row) => (
              <tr key={row.id}>
                <Td>{formatStamp(row.createdAt)}</Td>
                <Td>{row.technicianName ?? t("common.dash")}</Td>
                <Td className="font-semibold">{row.part ? localizedName(row.part) : t("common.dash")}</Td>
                <Td>{t(`techStock.kind.${row.kind}`)}</Td>
                <Td>{row.quantity}</Td>
                <Td>{row.createdByName ?? t("common.dash")}</Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.mode === "return" ? t("techStock.takeBack") : t("techStock.issue")}>
        {form ? (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("techStock.technician")}>
              <select className={inputClass} value={form.technicianId} onChange={(event) => setForm({ ...form, technicianId: event.target.value })} required>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("catalog.part")}>
              <select className={inputClass} value={form.sparePartId} onChange={(event) => setForm({ ...form, sparePartId: event.target.value })} required>
                <option value="">{t("common.select")}</option>
                {(parts.data?.parts ?? []).map((part) => (
                  <option key={part.id} value={part.id}>
                    {localizedName(part)} · {t("techStock.inWarehouse", { count: part.stockQuantity })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("common.qty")}>
              <input className={inputClass} type="number" min={1} max={999} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
            </Field>
            <Field label={t("common.note")}>
              <input className={inputClass} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={200} />
            </Field>
            <button type="submit" className="btn-rizo h-12 w-full" disabled={move.isPending}>
              {move.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t("common.save")}
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
