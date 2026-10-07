import { z } from "zod";
import { prisma } from "./prisma.js";

export const checklistItemSchema = z.object({
  id: z.string().trim().min(1).max(40),
  uz: z.string().trim().max(160).default(""),
  ru: z.string().trim().max(160).default(""),
  en: z.string().trim().max(160).default(""),
  required: z.boolean().default(false),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type ChecklistKind = "diagnosis" | "completion";

function parseItems(value: unknown): ChecklistItem[] {
  const parsed = z.array(checklistItemSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The template of a kind for a product category: the one made for the category, otherwise the general one. */
export async function checklistFor(kind: ChecklistKind, category: string) {
  const templates = await prisma.checklistTemplate.findMany({ where: { kind, isActive: true, OR: [{ productCategory: category }, { productCategory: null }] } });
  const chosen = templates.find((row) => row.productCategory === category) ?? templates.find((row) => row.productCategory == null);
  return chosen ? parseItems(chosen.items) : [];
}

export function checkedIds(stored: unknown, kind: ChecklistKind): string[] {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];
  const value = (stored as Record<string, unknown>)[kind];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** What the technician sees for a job: both lists with what is ticked, and the required items still open. */
export async function checklistView(job: { completionChecklist: unknown; product: { category: string } }) {
  const [diagnosis, completion] = await Promise.all([checklistFor("diagnosis", job.product.category), checklistFor("completion", job.product.category)]);
  const done = checkedIds(job.completionChecklist, "completion");
  return {
    diagnosis: { items: diagnosis, checked: checkedIds(job.completionChecklist, "diagnosis") },
    completion: { items: completion, checked: done },
    missingRequired: completion.filter((item) => item.required && !done.includes(item.id)).map((item) => item.id),
  };
}
