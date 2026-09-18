import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useStaffAuth } from "../features/auth/StaffAuthContext";
import { api } from "../lib/api";
import { formatPhone, formatRequestId } from "../lib/format";
import { localizedName } from "../lib/localized";
import type { SearchResults } from "../lib/types";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { StatusBadge, WarrantyBadge } from "./Badges";

export function QuickSearch() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);

  const results = useQuery({
    queryKey: ["staff", "search", debounced],
    enabled: Boolean(token) && debounced.trim().length >= 2,
    queryFn: () => api<SearchResults>(`/api/staff/search?q=${encodeURIComponent(debounced.trim())}`, { token }),
  });

  const customers = results.data?.customers ?? [];
  const sales = results.data?.sales ?? [];
  const requests = results.data?.requests ?? [];
  const empty = Boolean(
    debounced.trim().length >= 2 && results.isSuccess && customers.length === 0 && sales.length === 0 && requests.length === 0,
  );

  return (
    <Combobox
      value={null}
      onChange={(value: { kind: "customer" | "sale" | "request"; id: string; extra?: string } | null) => {
        if (!value) return;
        setQuery("");
        if (value.kind === "customer") {
          navigate(`/app/customers/${value.id}`);
        } else if (value.kind === "request") {
          navigate(`/app/requests/${value.id}`);
        } else {
          navigate(`/app/sales?invoice=${encodeURIComponent(value.extra ?? "")}`);
        }
      }}
      immediate
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <ComboboxInput
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pr-3 pl-10 text-sm outline-none ring-[#B439FD] focus:bg-white focus:ring-2"
        />
        <ComboboxOptions className="absolute z-40 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white py-2 shadow-xl">
          {results.isFetching ? <p className="px-4 py-3 text-sm text-neutral-500">{t("search.searching")}</p> : null}
          {empty ? <p className="px-4 py-3 text-sm text-neutral-500">{t("search.empty")}</p> : null}
          {customers.length > 0 ? <p className="px-4 pt-1 pb-1 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{t("search.customers")}</p> : null}
          {customers.map((customer) => (
            <ComboboxOption
              key={customer.id}
              value={{ kind: "customer" as const, id: customer.id }}
              className="cursor-pointer px-4 py-2.5 data-focus:bg-[#F3E8FF]"
            >
              <p className="text-sm font-semibold text-neutral-900">{customer.name}</p>
              <p className="text-xs text-neutral-500">{formatPhone(customer.phone)}</p>
            </ComboboxOption>
          ))}
          {sales.length > 0 ? <p className="px-4 pt-2 pb-1 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{t("search.invoices")}</p> : null}
          {sales.map((sale) => (
            <ComboboxOption
              key={sale.id}
              value={{ kind: "sale" as const, id: sale.id, extra: sale.invoiceNumber }}
              className="cursor-pointer px-4 py-2.5 data-focus:bg-[#FFF4E5]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{sale.invoiceNumber}</p>
                  <p className="text-xs text-neutral-500">
                    {sale.customer.name} · {localizedName(sale.product)}
                  </p>
                </div>
                <WarrantyBadge status={sale.warrantyStatus} />
              </div>
            </ComboboxOption>
          ))}
          {requests.length > 0 ? <p className="px-4 pt-2 pb-1 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{t("search.requests")}</p> : null}
          {requests.map((request) => (
            <ComboboxOption
              key={request.id}
              value={{ kind: "request" as const, id: request.id }}
              className="cursor-pointer px-4 py-2.5 data-focus:bg-[#F3E8FF]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-neutral-900">{formatRequestId(request.displayId)}</p>
                  <p className="text-xs text-neutral-500">
                    {request.customerName} · {localizedName(request.product) || request.productName}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </div>
            </ComboboxOption>
          ))}
          {query.trim().length < 2 ? (
            <p className="px-4 py-3 text-sm text-neutral-500">{t("search.minChars")}</p>
          ) : null}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
