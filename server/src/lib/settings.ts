import { prisma } from "./prisma.js";

const DEFAULTS: Record<string, string> = {
  block_zero_stock: "true",
};

export async function getSetting(key: string) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

export async function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function isBlockZeroStock() {
  return (await getSetting("block_zero_stock")) !== "false";
}

export async function getAppSettings() {
  const rows = await prisma.appSetting.findMany();
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return {
    blockZeroStock: map.block_zero_stock !== "false",
  };
}
