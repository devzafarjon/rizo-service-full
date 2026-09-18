export const FALLBACK_REGION_CODE = "00";

export type UzbekistanRegion = {
  code: string;
  name: string;
  aliases: string[];
};

export const UZBEKISTAN_REGIONS: UzbekistanRegion[] = [
  { code: "01", name: "Toshkent shahri", aliases: ["toshkent shahri", "tashkent city", "toshkent city", "tashkent shahri"] },
  {
    code: "10",
    name: "Toshkent viloyati",
    aliases: ["toshkent viloyati", "tashkent viloyati", "tashkent region", "toshkent region", "tashkent province"],
  },
  { code: "20", name: "Sirdaryo", aliases: ["sirdaryo", "sirdarya", "syrdarya", "guliston", "gulistan"] },
  { code: "25", name: "Jizzax", aliases: ["jizzax", "jizzakh", "djizzak"] },
  { code: "30", name: "Samarqand", aliases: ["samarqand", "samarkand"] },
  { code: "40", name: "Fargʻona", aliases: ["fargona", "fergana", "ferghana"] },
  { code: "50", name: "Namangan", aliases: ["namangan"] },
  { code: "60", name: "Andijon", aliases: ["andijon", "andijan"] },
  { code: "70", name: "Qashqadaryo", aliases: ["qashqadaryo", "kashkadarya", "qarshi", "karshi"] },
  { code: "75", name: "Surxondaryo", aliases: ["surxondaryo", "surkhandarya", "termez"] },
  { code: "80", name: "Buxoro", aliases: ["buxoro", "bukhara", "bukhoro"] },
  { code: "85", name: "Navoiy", aliases: ["navoiy", "navoi"] },
  { code: "90", name: "Xorazm", aliases: ["xorazm", "khorezm", "khiva", "urganch", "urgench"] },
  {
    code: "95",
    name: "Qoraqalpogʻiston",
    aliases: ["qoraqalpogiston", "karakalpakstan", "qoraqalpogiston respublikasi", "nukus"],
  },
];

const REGION_CODE_SET = new Set([FALLBACK_REGION_CODE, ...UZBEKISTAN_REGIONS.map((region) => region.code)]);

const ALIAS_MATCHERS = UZBEKISTAN_REGIONS.flatMap((region) =>
  region.aliases.map((alias) => ({ code: region.code, alias: normalizeRegionText(alias) })),
).sort((a, b) => b.alias.length - a.alias.length);

export function isRegionCode(value: string): boolean {
  return REGION_CODE_SET.has(value);
}

export function normalizeRegionText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`ʻ’‘]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRegionCode(text: string | null | undefined): string {
  if (!text?.trim()) return FALLBACK_REGION_CODE;
  const normalized = normalizeRegionText(text);
  if (!normalized) return FALLBACK_REGION_CODE;
  const match = ALIAS_MATCHERS.find((item) => normalized.includes(item.alias));
  return match?.code ?? FALLBACK_REGION_CODE;
}

export function resolveRegionCode(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    if (!source?.trim()) continue;
    const trimmed = source.trim();
    if (isRegionCode(trimmed) && trimmed !== FALLBACK_REGION_CODE) {
      return trimmed;
    }
    const inferred = inferRegionCode(trimmed);
    if (inferred !== FALLBACK_REGION_CODE) return inferred;
  }
  return FALLBACK_REGION_CODE;
}

export function regionLabel(code: string) {
  if (code === FALLBACK_REGION_CODE) return "Unknown region";
  return UZBEKISTAN_REGIONS.find((region) => region.code === code)?.name ?? "Unknown region";
}
