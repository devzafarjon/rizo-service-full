import { prisma } from "./prisma.js";

/** Product categories are a real table; creating a product or catalog item with a new name registers it. */
export async function ensureCategories(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  for (const name of unique) {
    await prisma.productCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  return unique;
}
