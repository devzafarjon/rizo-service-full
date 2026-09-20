import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { ApiError, api, apiErrorMessage } from "../../lib/api";
import { formatPhone } from "../../lib/format";
import type { StaffCustomer } from "../../lib/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { CustomerFormModal } from "./CustomerFormModal";

export function CustomersPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 250);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffCustomer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffCustomer | null>(null);
  const [existing, setExisting] = useState<StaffCustomer | null>(null);

  const list = useQuery({
    queryKey: ["staff", "customers", debounced],
    enabled: Boolean(token),
    queryFn: () =>
      api<{ customers: StaffCustomer[] }>(
        `/api/staff/customers${debounced.trim() ? `?q=${encodeURIComponent(debounced.trim())}` : ""}`,
        { token },
      ),
  });

  const save = useMutation({
    mutationFn: async (values: {
      name: string;
      phone: string;
      address?: string;
      regionCode?: string;
      notes?: string;
      password?: string;
    }) => {
      if (editing) {
        return api<{ customer: StaffCustomer; temporaryPassword?: string | null }>(`/api/staff/customers/${editing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(values),
        });
      }
      return api<{ customer: StaffCustomer; temporaryPassword?: string | null }>("/api/staff/customers", {
        method: "POST",
        token,
        body: JSON.stringify(values),
      });
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "customers"] });
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      if (data.temporaryPassword) {
        setTempPassword(data.temporaryPassword);
      }
      notify(editing ? t("customers.updated") : t("customers.added"));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "phoneExists") {
        const customer = error.details?.customer as StaffCustomer | undefined;
        if (customer) setExisting(customer);
      }
      setFormError(apiErrorMessage(error, t));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/customers/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "customers"] });
      setPendingDelete(null);
      notify(t("customers.deleted"));
    },
    onError: (error) => {
      notify(apiErrorMessage(error, t), "error");
    },
  });

  if (list.isLoading) {
    return <PageSkeleton />;
  }

  const customers = list.data?.customers ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("customers.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("customers.intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/customers/duplicates"
            className="inline-flex h-11 items-center rounded-xl bg-neutral-100 px-4 text-sm font-bold text-[#B439FD]"
          >
            {t("customers.findDuplicates")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setExisting(null);
              setFormOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white hover:bg-[#C45FFF]"
          >
            <Plus size={16} />
            {t("customers.new")}
          </button>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          className={`${inputClass} pl-10`}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t("customers.searchPlaceholder")}
        />
      </div>

      {customers.length === 0 ? (
        <EmptyState title={t("customers.emptyTitle")} body={t("customers.emptyBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("common.name")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{t("common.address")}</Th>
              <Th>{t("customers.sales")}</Th>
              <Th>{t("customers.jobs")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <Td>
                  <Link to={`/app/customers/${customer.id}`} className="font-semibold text-[#B439FD] hover:underline">
                    {customer.name}
                  </Link>
                </Td>
                <Td>{formatPhone(customer.phone)}</Td>
                <Td className="max-w-xs truncate text-neutral-500">{customer.address ?? t("common.dash")}</Td>
                <Td>{customer.salesCount}</Td>
                <Td>{customer.requestsCount}</Td>
                <Td className="text-right">
                  <button
                    type="button"
                    className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#B439FD]"
                    onClick={() => {
                      setEditing(customer);
                      setFormError(null);
                      setFormOpen(true);
                    }}
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-600 hover:text-red-700"
                    onClick={() => setPendingDelete(customer)}
                  >
                    {t("common.delete")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        existing={existing}
        pending={save.isPending}
        error={formError}
        onClose={() => {
          setFormOpen(false);
          setExisting(null);
        }}
        onUseExisting={(customer) => {
          setFormOpen(false);
          setExisting(null);
          navigate(`/app/customers/${customer.id}`);
        }}
        onSubmit={async (values) => {
          setExisting(null);
          await save.mutateAsync(values);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("customers.deleteTitle")}
        body={pendingDelete ? t("customers.deleteBody", { name: pendingDelete.name }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />

      <Modal open={Boolean(tempPassword)} onClose={() => setTempPassword(null)} title={t("customers.passwordCreated")}>
        <p className="text-sm text-neutral-600">{t("customers.passwordShare")}</p>
        <p className="mt-4 rounded-xl bg-[#F3E8FF] px-4 py-3 font-mono text-lg font-bold text-[#B439FD]">{tempPassword}</p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="h-11 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white"
            onClick={() => setTempPassword(null)}
          >
            {t("common.done")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
