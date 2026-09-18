import i18n from "../i18n";

export const FALLBACK_REGION_CODE = "00";

export const UZBEKISTAN_REGIONS = [
  { code: "01", name: "Toshkent shahri" },
  { code: "10", name: "Toshkent viloyati" },
  { code: "20", name: "Sirdaryo" },
  { code: "25", name: "Jizzax" },
  { code: "30", name: "Samarqand" },
  { code: "40", name: "Fargʻona" },
  { code: "50", name: "Namangan" },
  { code: "60", name: "Andijon" },
  { code: "70", name: "Qashqadaryo" },
  { code: "75", name: "Surxondaryo" },
  { code: "80", name: "Buxoro" },
  { code: "85", name: "Navoiy" },
  { code: "90", name: "Xorazm" },
  { code: "95", name: "Qoraqalpogʻiston" },
] as const;

export function regionLabel(code: string) {
  const key = !code || code === FALLBACK_REGION_CODE ? "00" : code;
  const fallback = UZBEKISTAN_REGIONS.find((region) => region.code === key)?.name ?? "Unknown region";
  return i18n.t(`regions.${key}`, { defaultValue: fallback });
}
