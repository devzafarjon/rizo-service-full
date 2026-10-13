import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";

export const OWN_BRAND_ID = "brand_rizo";

/** "Samsung", "samsung" and "SAM-SUNG" are one brand: letters and digits only, lower case. */
export function directoryKey(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function distance(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = held;
    }
  }
  return row[b.length];
}

/** Whether two keys are close enough that the second is probably a typo or a variant of the first. */
export function looksLike(a: string, b: string) {
  if (!a || !b || a === b) return false;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true;
  const limit = Math.max(a.length, b.length) >= 8 ? 2 : Math.max(a.length, b.length) >= 4 ? 1 : 0;
  return limit > 0 && distance(a, b) <= limit;
}

export type DirectoryActor = { id: string; name: string; role: string };

/** Admins' own entries are approved at once; everyone else's wait for an admin. */
export const approvedFor = (actor: DirectoryActor) => actor.role === "admin";

export function serializeBrand(brand: { id: string; name: string; isOwn: boolean; approved: boolean; addedByName: string | null }, extra?: { modelCount?: number; pendingModels?: number; categories?: string[] }) {
  return { id: brand.id, name: brand.name, isOwn: brand.isOwn, approved: brand.approved, addedByName: brand.addedByName, ...extra };
}

export async function similarBrands(name: string) {
  const key = directoryKey(name);
  const all = await prisma.brand.findMany({ select: { id: true, name: true, key: true, isOwn: true, approved: true, addedByName: true } });
  return {
    exact: all.find((brand) => brand.key === key) ?? null,
    similar: all.filter((brand) => looksLike(brand.key, key)),
  };
}

/** Finds the brand with this name or creates it. Close-but-different names are refused unless `force` is set. */
export async function addBrand(input: { name: string; actor: DirectoryActor; force?: boolean }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!directoryKey(name)) throw new HttpError(400, "Enter the brand name", "brandNameRequired");
  const { exact, similar } = await similarBrands(name);
  if (exact) return { brand: exact, created: false };
  if (similar.length > 0 && !input.force) {
    throw new HttpError(409, "A similar brand already exists", "similarBrand", { similar: similar.map((brand) => ({ id: brand.id, name: brand.name })) });
  }
  const brand = await prisma.brand.create({
    data: { name, key: directoryKey(name), addedByName: input.actor.name, approved: approvedFor(input.actor) },
  });
  return { brand, created: true };
}

function modelSku(brandKey: string) {
  return `EXT-${(brandKey.slice(0, 6) || "X").toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** The text shown for a model: the brand first, unless the model name already starts with it. */
export function fullModelName(brandName: string, model: string) {
  const text = model.trim().replace(/\s+/g, " ");
  return directoryKey(text).startsWith(directoryKey(brandName)) ? text : `${brandName} ${text}`;
}

export async function similarModels(brandId: string, category: string, model: string, brandName: string) {
  const key = directoryKey(fullModelName(brandName, model));
  const rows = await prisma.product.findMany({ where: { brandId, category }, select: { id: true, name: true, approved: true } });
  return {
    exact: rows.find((row) => directoryKey(row.name) === key) ?? null,
    similar: rows.filter((row) => looksLike(directoryKey(row.name), key)),
  };
}

/** A model of another maker: no warranty from us, repaired for a fee. */
export async function addModel(input: { brandId: string; category: string; model: string; actor: DirectoryActor; force?: boolean }) {
  const brand = await prisma.brand.findUnique({ where: { id: input.brandId } });
  if (!brand) throw new HttpError(404, "Brand not found");
  if (brand.isOwn) throw new HttpError(400, "RIZO products are managed in the catalogue", "ownBrandModel");
  const category = await prisma.productCategory.findUnique({ where: { name: input.category } });
  if (!category) throw new HttpError(400, "Choose an existing category", "unknownCategory");
  const name = fullModelName(brand.name, input.model);
  if (!directoryKey(input.model)) throw new HttpError(400, "Enter the model", "modelNameRequired");
  const { exact, similar } = await similarModels(brand.id, category.name, input.model, brand.name);
  if (exact) return { product: await prisma.product.findUniqueOrThrow({ where: { id: exact.id } }), created: false };
  if (similar.length > 0 && !input.force) {
    throw new HttpError(409, "A similar model already exists", "similarModel", { similar: similar.map((row) => ({ id: row.id, name: row.name })) });
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const product = await prisma.product.create({
        data: {
          name,
          nameUz: name,
          nameRu: name,
          nameEn: name,
          sku: modelSku(brand.key),
          category: category.name,
          warrantyMonths: 0,
          brandId: brand.id,
          addedByName: input.actor.name,
          approved: approvedFor(input.actor) && brand.approved,
        },
      });
      return { product, created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new HttpError(500, "Could not create the model, try again");
}

/** Products a request or a sale may use: the company's own, or another maker's once an admin approved it. */
export const usableProductWhere: Prisma.ProductWhereInput = { approved: true, brand: { approved: true } };

export function assertUsableProduct(product: { approved: boolean; brand?: { approved: boolean; isOwn: boolean } | null }) {
  if (!product.approved || (product.brand && !product.brand.approved)) {
    throw new HttpError(409, "This model is waiting for an admin to approve it", "modelNotApproved");
  }
}
