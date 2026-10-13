import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { ApiError, api } from "../../lib/api";
import type { DirBrand, DirModel } from "../../lib/types";

export type Similar = { id: string; name: string }[];

/** A "similar name already exists" answer: the caller shows the names and may add anyway. */
export function similarOf(err: unknown, code: "similarBrand" | "similarModel"): Similar | null {
  if (err instanceof ApiError && err.code === code && Array.isArray(err.details?.similar)) return err.details!.similar as Similar;
  return null;
}

export function useBrands() {
  const { token } = useStaffAuth();
  return useQuery({
    queryKey: ["staff", "directory", "brands"],
    enabled: Boolean(token),
    queryFn: () => api<{ brands: DirBrand[] }>("/api/staff/directory/brands", { token }),
  });
}

export function useModels(filter: { brandId?: string; category?: string; pending?: boolean; q?: string }, enabled = true) {
  const { token } = useStaffAuth();
  const params = new URLSearchParams();
  if (filter.brandId) params.set("brandId", filter.brandId);
  if (filter.category) params.set("category", filter.category);
  if (filter.pending) params.set("approved", "false");
  if (filter.q) params.set("q", filter.q);
  return useQuery({
    queryKey: ["staff", "directory", "models", params.toString()],
    enabled: Boolean(token) && enabled,
    queryFn: () => api<{ models: DirModel[] }>(`/api/staff/directory/models?${params}`, { token }),
  });
}

export function useDirectoryActions() {
  const { token } = useStaffAuth();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["staff", "directory"] });
  const post = (path: string, body?: unknown) => api<any>(`/api/staff/directory${path}`, { method: "POST", token, body: JSON.stringify(body ?? {}) });
  return {
    refresh,
    addBrand: (name: string, force = false) => post("/brands", { name, force }).then((r) => { refresh(); return r as { brand: DirBrand; created: boolean }; }),
    addModel: (input: { brandId: string; category: string; model: string; force?: boolean }) => post("/models", input).then((r) => { refresh(); return r as { model: DirModel; created: boolean }; }),
    approveBrand: (id: string) => post(`/brands/${id}/approve`).then(refresh),
    approveModel: (id: string) => post(`/models/${id}/approve`).then(refresh),
    renameBrand: (id: string, name: string) => api(`/api/staff/directory/brands/${id}`, { method: "PATCH", token, body: JSON.stringify({ name }) }).then(refresh),
    renameModel: (id: string, model: string) => api(`/api/staff/directory/models/${id}`, { method: "PATCH", token, body: JSON.stringify({ model }) }).then(refresh),
    deleteBrand: (id: string) => api(`/api/staff/directory/brands/${id}`, { method: "DELETE", token }).then(refresh),
    deleteModel: (id: string) => api(`/api/staff/directory/models/${id}`, { method: "DELETE", token }).then(refresh),
    mergeBrand: (id: string, intoId: string) => post(`/brands/${id}/merge`, { intoId }).then(refresh),
    mergeModel: (id: string, intoId: string) => post(`/models/${id}/merge`, { intoId }).then(refresh),
  };
}

export function useCategories() {
  const { token } = useStaffAuth();
  return useQuery({
    queryKey: ["staff", "directory", "categories"],
    enabled: Boolean(token),
    queryFn: () => api<{ categories: string[] }>("/api/staff/directory/categories", { token }),
  });
}
