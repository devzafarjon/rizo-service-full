import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatPhone } from "../../lib/format";
import type { StaffCustomer } from "../../lib/types";

export function CustomerDuplicatesPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["staff", "customers", "duplicates"],
    enabled: Boolean(token),
    queryFn: () => api<{ groups: StaffCustomer[][] }>("/api/staff/customers/duplicates", { token }),
  });

  const merge = useMutation({
    mutationFn: (input: { keepId: string; absorbId: string }) =>
      api("/api/staff/customers/merge", { method: "POST", token, body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "customers"] });
      notify(t("customers.merged"));
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (list.isLoading) return <PageSkeleton />;
  const groups = list.data?.groups ?? [];

  return (
    <div>
      <Link to="/app/customers" className="text-sm font-semibold text-[#B439FD]">
        {t("nav.customers")}
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t("customers.duplicatesTitle")}</h1>
      <p className="mt-1 mb-5 text-sm text-neutral-500">{t("customers.duplicatesIntro")}</p>
      {groups.length === 0 ? (
        <EmptyState title={t("customers.noDuplicatesTitle")} body={t("customers.noDuplicatesBody")} />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.map((item) => item.id).join("-")} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-bold tracking-wide text-neutral-400 uppercase">{formatPhone(group[0]?.phone ?? "")}</p>
              <ul className="mt-3 space-y-3">
                {group.map((customer) => (
                  <li key={customer.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link to={`/app/customers/${customer.id}`} className="font-bold text-[#B439FD]">
                        {customer.name}
                      </Link>
                      <p className="text-xs text-neutral-500">
                        {t("customers.sales")}: {customer.salesCount} · {t("customers.jobs")}: {customer.requestsCount}
                      </p>
                    </div>
                    {group
                      .filter((other) => other.id !== customer.id)
                      .map((other) => (
                        <button
                          key={other.id}
                          type="button"
                          disabled={merge.isPending}
                          onClick={() => merge.mutate({ keepId: customer.id, absorbId: other.id })}
                          className="h-10 rounded-xl bg-neutral-100 px-3 text-xs font-bold text-[#B439FD]"
                        >
                          {t("customers.keepAndMerge", { name: customer.name })}
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
