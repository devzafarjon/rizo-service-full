import i18n from "../i18n";

export type Named = {
  name: string;
  nameUz?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
};

export function localizedName(item: Named | string | null | undefined, language = i18n.language): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  const lang = language.slice(0, 2);
  if (lang === "uz" && item.nameUz) return item.nameUz;
  if (lang === "ru" && item.nameRu) return item.nameRu;
  if (lang === "en" && item.nameEn) return item.nameEn;
  return item.name;
}

export function categoryLabel(category: string, language = i18n.language) {
  return i18n.getFixedT(language)(`categories.${category}`, { defaultValue: category });
}

export function namedFields(item?: Named | null) {
  return {
    nameUz: item?.nameUz || item?.name || "",
    nameRu: item?.nameRu || item?.name || "",
    nameEn: item?.nameEn || item?.name || "",
  };
}

export function nameSearchText(item: Named | string | null | undefined) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return [item.name, item.nameUz, item.nameRu, item.nameEn].filter(Boolean).join(" ");
}
