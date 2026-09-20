import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import type { ScheduleDay, TechnicianSummary } from "../../lib/types";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ScheduleCalendarPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = addDays(from, 13);

  const schedule = useQuery({
    queryKey: ["staff", "schedule", from, to],
    enabled: Boolean(token),
    queryFn: () =>
      api<{ technicians: TechnicianSummary[]; days: ScheduleDay[] }>(
        `/api/staff/technicians/schedule?from=${from}&to=${to}`,
        { token },
      ),
  });

  const toggle = useMutation({
    mutationFn: (input: { technicianId: string; date: string; isWorking: boolean }) =>
      api(`/api/staff/technicians/${input.technicianId}/schedule`, {
        method: "PUT",
        token,
        body: JSON.stringify({ date: input.date, isWorking: input.isWorking }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "schedule"] }),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(from, index)), [from]);
  const map = useMemo(() => {
    const next = new Map<string, ScheduleDay>();
    for (const row of schedule.data?.days ?? []) next.set(`${row.technicianId}:${row.date}`, row);
    return next;
  }, [schedule.data?.days]);

  if (schedule.isLoading) return <PageSkeleton />;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("schedule.title")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("schedule.intro")}</p>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="min-w-max text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="sticky left-0 bg-white px-3 py-3 text-sm font-bold">{t("common.technician")}</th>
              {days.map((day) => (
                <th key={day} className="px-2 py-3 font-semibold text-neutral-500">
                  {formatDate(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(schedule.data?.technicians ?? []).map((tech) => (
              <tr key={tech.id} className="border-b border-neutral-50">
                <td className="sticky left-0 bg-white px-3 py-2 text-sm font-bold">{tech.name}</td>
                {days.map((day) => {
                  const row = map.get(`${tech.id}:${day}`);
                  const working = row ? row.isWorking : true;
                  return (
                    <td key={day} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggle.mutate({ technicianId: tech.id, date: day, isWorking: !working })}
                        className={`h-8 min-w-16 rounded-full px-2 text-[11px] font-bold ${
                          working ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {working ? t("schedule.on") : t("schedule.off")}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
