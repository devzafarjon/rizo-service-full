export type NamedRecord = {
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
};

export function serializeNamed(item: NamedRecord) {
  return {
    name: item.name,
    nameUz: item.nameUz || item.name,
    nameRu: item.nameRu || item.name,
    nameEn: item.nameEn || item.name,
  };
}

export function namedFromInput(input: {
  name?: string;
  nameUz?: string;
  nameRu?: string;
  nameEn?: string;
}) {
  const nameUz = input.nameUz?.trim() ?? "";
  const nameRu = input.nameRu?.trim() ?? "";
  const nameEn = input.nameEn?.trim() ?? "";
  const name = input.name?.trim() || nameEn || nameUz || nameRu;
  return {
    name,
    nameUz: nameUz || name,
    nameRu: nameRu || name,
    nameEn: nameEn || name,
  };
}

export function namedSearch(q: string) {
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { nameUz: { contains: q, mode: "insensitive" as const } },
      { nameRu: { contains: q, mode: "insensitive" as const } },
      { nameEn: { contains: q, mode: "insensitive" as const } },
    ],
  };
}
