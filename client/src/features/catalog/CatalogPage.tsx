import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatMoney, SUGGESTED_CATEGORIES } from "../../lib/format";
import { categoryLabel, localizedName, namedFields } from "../../lib/localized";
import type { CatalogService, Product, SparePart } from "../../lib/types";

export function CatalogPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const products = useQuery({
    queryKey: ["staff", "products"],
    enabled: Boolean(token),
    queryFn: () => api<{ products: Product[] }>("/api/staff/products", { token }),
  });
  const services = useQuery({
    queryKey: ["staff", "services"],
    enabled: Boolean(token),
    queryFn: () => api<{ services: CatalogService[] }>("/api/staff/catalog/services", { token }),
  });
  const parts = useQuery({
    queryKey: ["staff", "parts"],
    enabled: Boolean(token),
    queryFn: () => api<{ parts: SparePart[] }>("/api/staff/catalog/parts", { token }),
  });
  const categories = useQuery({
    queryKey: ["staff", "categories"],
    enabled: Boolean(token),
    queryFn: () => api<{ categories: string[] }>("/api/staff/catalog/categories", { token }),
  });

  if (products.isLoading || services.isLoading || parts.isLoading) {
    return <PageSkeleton />;
  }

  const categoryOptions = [...new Set([...(categories.data?.categories ?? []), ...SUGGESTED_CATEGORIES])].sort();
  const tabs = [
    { id: "products", label: t("catalog.products") },
    { id: "services", label: t("catalog.services") },
    { id: "parts", label: t("catalog.parts") },
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("catalog.title")}</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">{t("catalog.intro")}</p>
      <TabGroup>
        <TabList className="mb-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              className="rounded-full px-4 py-2 text-sm font-bold text-neutral-600 outline-none data-selected:bg-[#B439FD] data-selected:text-white"
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel>
            <ProductsPanel items={products.data?.products ?? []} categories={categoryOptions} />
          </TabPanel>
          <TabPanel>
            <ServicesPanel items={services.data?.services ?? []} categories={categoryOptions} />
          </TabPanel>
          <TabPanel>
            <PartsPanel items={parts.data?.parts ?? []} categories={categoryOptions} />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}

function ProductsPanel({ items, categories }: { items: Product[]; categories: string[] }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [form, setForm] = useState({ nameUz: "", nameRu: "", nameEn: "", sku: "", category: "" });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify(form);
      return editing
        ? api(`/api/staff/products/${editing.id}`, { method: "PATCH", token, body })
        : api("/api/staff/products", { method: "POST", token, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "categories"] });
      setOpen(false);
      notify(editing ? t("catalog.productUpdated") : t("catalog.productAdded"));
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/products/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "products"] });
      setPendingDelete(null);
      notify(t("catalog.productDeleted"));
    },
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });

  function start(product: Product | null) {
    setEditing(product);
    setForm({ ...namedFields(product), sku: product?.sku ?? "", category: product?.category ?? "" });
    setError(null);
    setOpen(true);
  }

  return (
    <CatalogSection actionLabel={t("catalog.newProduct")} onCreate={() => start(null)}>
      {items.length === 0 ? (
        <EmptyState title={t("catalog.noProductsTitle")} body={t("catalog.noProductsBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("common.name")}</Th>
              <Th>{t("common.sku")}</Th>
              <Th>{t("common.category")}</Th>
              <Th>{t("catalog.salesCount")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((product) => (
              <tr key={product.id} className="border-b border-neutral-100 last:border-0">
                <Td className="font-semibold">{localizedName(product)}</Td>
                <Td>{product.sku}</Td>
                <Td>{categoryLabel(product.category)}</Td>
                <Td>{product.salesCount}</Td>
                <Td className="text-right">
                  <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#B439FD]" onClick={() => start(product)}>
                    {t("common.edit")}
                  </button>
                  <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setPendingDelete(product)}>
                    {t("common.delete")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t("catalog.editProduct") : t("catalog.newProduct")}>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <NameFields form={form} onChange={(names) => setForm({ ...form, ...names })} />
          <Field label={t("common.sku")}>
            <input className={inputClass} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
          </Field>
          <Field label={t("catalog.productCategory")} hint={t("catalog.categoryHint")}>
            <input className={inputClass} list="product-categories" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
            <datalist id="product-categories">
              {categories.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <FormActions pending={save.isPending} onCancel={() => setOpen(false)} submitLabel={editing ? t("common.save") : t("catalog.addProduct")} />
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("catalog.deleteProductTitle")}
        body={pendingDelete ? t("catalog.deleteProductBody", { name: localizedName(pendingDelete) }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </CatalogSection>
  );
}

function ServicesPanel({ items, categories }: { items: CatalogService[]; categories: string[] }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogService | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CatalogService | null>(null);
  const [form, setForm] = useState({ nameUz: "", nameRu: "", nameEn: "", price: "", productCategory: "" });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ ...form, price: Number(form.price) });
      return editing
        ? api(`/api/staff/catalog/services/${editing.id}`, { method: "PATCH", token, body })
        : api("/api/staff/catalog/services", { method: "POST", token, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "services"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "categories"] });
      setOpen(false);
      notify(editing ? t("catalog.serviceUpdated") : t("catalog.serviceAdded"));
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/catalog/services/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "services"] });
      setPendingDelete(null);
      notify(t("catalog.serviceDeleted"));
    },
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });

  function start(item: CatalogService | null) {
    setEditing(item);
    setForm({ ...namedFields(item), price: item ? String(item.price) : "", productCategory: item?.productCategory ?? "" });
    setError(null);
    setOpen(true);
  }

  return (
    <CatalogSection actionLabel={t("catalog.newService")} onCreate={() => start(null)}>
      {items.length === 0 ? (
        <EmptyState title={t("catalog.noServicesTitle")} body={t("catalog.noServicesBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("catalog.service")}</Th>
              <Th>{t("common.category")}</Th>
              <Th>{t("common.price")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                <Td className="font-semibold">{localizedName(item)}</Td>
                <Td>{categoryLabel(item.productCategory)}</Td>
                <Td>{formatMoney(item.price)}</Td>
                <Td className="text-right">
                  <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#B439FD]" onClick={() => start(item)}>
                    {t("common.edit")}
                  </button>
                  <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setPendingDelete(item)}>
                    {t("common.delete")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <CategoryFormModal
        open={open}
        title={editing ? t("catalog.editService") : t("catalog.newService")}
        form={form}
        categories={categories}
        error={error}
        pending={save.isPending}
        onClose={() => setOpen(false)}
        onChange={(next) => setForm({
          nameUz: next.nameUz,
          nameRu: next.nameRu,
          nameEn: next.nameEn,
          price: next.price,
          productCategory: next.productCategory,
        })}
        onSubmit={() => save.mutate()}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("catalog.deleteServiceTitle")}
        body={pendingDelete ? t("catalog.deleteServiceBody", { name: localizedName(pendingDelete) }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </CatalogSection>
  );
}

function PartsPanel({ items, categories }: { items: SparePart[]; categories: string[] }) {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SparePart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SparePart | null>(null);
  const [form, setForm] = useState({ nameUz: "", nameRu: "", nameEn: "", price: "", productCategory: "", stockQuantity: "0" });

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        ...form,
        price: Number(form.price),
        stockQuantity: Number(form.stockQuantity),
      });
      return editing
        ? api(`/api/staff/catalog/parts/${editing.id}`, { method: "PATCH", token, body })
        : api("/api/staff/catalog/parts", { method: "POST", token, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
      await queryClient.invalidateQueries({ queryKey: ["staff", "categories"] });
      setOpen(false);
      notify(editing ? t("catalog.partUpdated") : t("catalog.partAdded"));
    },
    onError: (err) => setError(apiErrorMessage(err, t)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/staff/catalog/parts/${id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "parts"] });
      setPendingDelete(null);
      notify(t("catalog.partDeleted"));
    },
    onError: (err) => notify(apiErrorMessage(err, t), "error"),
  });

  function start(item: SparePart | null) {
    setEditing(item);
    setForm({
      ...namedFields(item),
      price: item ? String(item.price) : "",
      productCategory: item?.productCategory ?? "",
      stockQuantity: item ? String(item.stockQuantity) : "0",
    });
    setError(null);
    setOpen(true);
  }

  return (
    <CatalogSection actionLabel={t("catalog.newPart")} onCreate={() => start(null)}>
      {items.length === 0 ? (
        <EmptyState title={t("catalog.noPartsTitle")} body={t("catalog.noPartsBody")} />
      ) : (
        <SurfaceTable>
          <thead>
            <tr className="border-b border-neutral-100">
              <Th>{t("catalog.part")}</Th>
              <Th>{t("common.category")}</Th>
              <Th>{t("common.price")}</Th>
              <Th>{t("common.stock")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                <Td className="font-semibold">{localizedName(item)}</Td>
                <Td>{categoryLabel(item.productCategory)}</Td>
                <Td>{formatMoney(item.price)}</Td>
                <Td>{item.stockQuantity}</Td>
                <Td className="text-right">
                  <button type="button" className="mr-2 text-sm font-semibold text-neutral-600 hover:text-[#B439FD]" onClick={() => start(item)}>
                    {t("common.edit")}
                  </button>
                  <button type="button" className="text-sm font-semibold text-red-600" onClick={() => setPendingDelete(item)}>
                    {t("common.delete")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
      )}
      <CategoryFormModal
        open={open}
        title={editing ? t("catalog.editPart") : t("catalog.newPart")}
        form={form}
        categories={categories}
        stock={form.stockQuantity}
        error={error}
        pending={save.isPending}
        onClose={() => setOpen(false)}
        onChange={(next) =>
          setForm({
            nameUz: next.nameUz,
            nameRu: next.nameRu,
            nameEn: next.nameEn,
            price: next.price,
            productCategory: next.productCategory,
            stockQuantity: next.stockQuantity ?? form.stockQuantity,
          })
        }
        onStock={(stockQuantity) => setForm({ ...form, stockQuantity })}
        onSubmit={() => save.mutate()}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("catalog.deletePartTitle")}
        body={pendingDelete ? t("catalog.deletePartBody", { name: localizedName(pendingDelete) }) : ""}
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </CatalogSection>
  );
}

function NameFields({
  form,
  onChange,
}: {
  form: { nameUz: string; nameRu: string; nameEn: string };
  onChange: (form: { nameUz: string; nameRu: string; nameEn: string }) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t("i18n.nameUz")}>
        <input className={inputClass} value={form.nameUz} onChange={(event) => onChange({ ...form, nameUz: event.target.value })} required />
      </Field>
      <Field label={t("i18n.nameRu")}>
        <input className={inputClass} value={form.nameRu} onChange={(event) => onChange({ ...form, nameRu: event.target.value })} required />
      </Field>
      <Field label={t("i18n.nameEn")}>
        <input className={inputClass} value={form.nameEn} onChange={(event) => onChange({ ...form, nameEn: event.target.value })} required />
      </Field>
    </>
  );
}

function CatalogSection({
  actionLabel,
  onCreate,
  children,
}: {
  actionLabel: string;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onCreate} className="inline-flex h-11 items-center rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white">
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function CategoryFormModal({
  open,
  title,
  form,
  categories,
  stock,
  error,
  pending,
  onClose,
  onChange,
  onStock,
  onSubmit,
}: {
  open: boolean;
  title: string;
  form: { nameUz: string; nameRu: string; nameEn: string; price: string; productCategory: string; stockQuantity?: string };
  categories: string[];
  stock?: string;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onChange: (value: { nameUz: string; nameRu: string; nameEn: string; price: string; productCategory: string; stockQuantity?: string }) => void;
  onStock?: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <NameFields form={form} onChange={(names) => onChange({ ...form, ...names })} />
        <Field label={t("catalog.productCategory")}>
          <input className={inputClass} list="catalog-categories" value={form.productCategory} onChange={(event) => onChange({ ...form, productCategory: event.target.value })} required />
          <datalist id="catalog-categories">
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
        <Field label={t("catalog.priceSom")}>
          <input className={inputClass} type="number" min={0} step={1000} value={form.price} onChange={(event) => onChange({ ...form, price: event.target.value })} required />
        </Field>
        {onStock ? (
          <Field label={t("catalog.stockQty")}>
            <input className={inputClass} type="number" min={0} value={stock} onChange={(event) => onStock(event.target.value)} required />
          </Field>
        ) : null}
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        <FormActions pending={pending} onCancel={onClose} submitLabel={t("common.save")} />
      </form>
    </Modal>
  );
}

function FormActions({ pending, onCancel, submitLabel }: { pending: boolean; onCancel: () => void; submitLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
        {t("common.cancel")}
      </button>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#B439FD] px-4 text-sm font-bold text-white disabled:opacity-70">
        {pending ? <Spinner className="h-4 w-4" /> : null}
        {submitLabel}
      </button>
    </div>
  );
}
