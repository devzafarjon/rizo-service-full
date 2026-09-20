import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import type { ScheduleDay } from "../../lib/types";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function MySchedulePage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = addDays(from, 13);

  const schedule = useQuery({
    queryKey: ["staff", "my-schedule", from, to],
    enabled: Boolean(token),
    queryFn: () => api<{ days: ScheduleDay[] }>(`/api/staff/my-jobs/schedule?from=${from}&to=${to}`, { token }),
  });

  const toggle = useMutation({
    mutationFn: (input: { date: string; isWorking: boolean }) =>
      api("/api/staff/my-jobs/schedule", {
        method: "PUT",
        token,
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff", "my-schedule"] }),
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(from, index)), [from]);
  const map = useMemo(() => new Map((schedule.data?.days ?? []).map((row) => [row.date, row])), [schedule.data?.days]);

  if (schedule.isLoading) return <PageSkeleton />;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("schedule.mine")}</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">{t("schedule.mineHint")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {days.map((day) => {
          const working = map.get(day)?.isWorking ?? true;
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle.mutate({ date: day, isWorking: !working })}
              className={`flex min-h-14 items-center justify-between rounded-2xl px-4 text-left ring-1 ${
                working ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50 ring-rose-100"
              }`}
            >
              <span className="font-bold">{formatDate(day)}</span>
              <span className="text-sm font-semibold">{working ? t("schedule.on") : t("schedule.off")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
