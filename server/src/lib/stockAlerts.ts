import { serializeNamed } from "./named.js";
import { notifyAdmins, notifyKeepers } from "./notifyStaff.js";
import { prisma } from "./prisma.js";

/** A warehouse with its own minimum for a part: the keeper is told once when the shelf falls to it, again after it was refilled. */
async function maybeAlertWarehouseLow(partId: string) {
  const rows = await prisma.partStock.findMany({ where: { sparePartId: partId, minQuantity: { not: null }, warehouse: { isActive: true } }, include: { warehouse: true, sparePart: true } });
  for (const row of rows) {
    const min = row.minQuantity!;
    if (row.quantity > min) {
      if (row.lowNotifiedAt) await prisma.partStock.update({ where: { id: row.id }, data: { lowNotifiedAt: null } });
      continue;
    }
    if (row.lowNotifiedAt) continue;
    await prisma.partStock.update({ where: { id: row.id }, data: { lowNotifiedAt: new Date() } });
    await notifyKeepers(row.warehouseId, {
      message: `${row.warehouse.name}: ${row.sparePart.name} is low (${row.quantity}, minimum ${min})`,
      code: "warehouseLow",
      sparePartId: partId,
      params: { ...serializeNamed(row.sparePart), warehouse: row.warehouse.name, count: row.quantity, min },
    });
  }
}

export async function maybeAlertLowStock(partId: string) {
  await maybeAlertWarehouseLow(partId);
  const part = await prisma.sparePart.findUnique({ where: { id: partId } });
  if (!part) return;
  if (part.stockQuantity > part.lowStockThreshold) {
    if (part.lowStockNotifiedAt) {
      await prisma.sparePart.update({
        where: { id: part.id },
        data: { lowStockNotifiedAt: null },
      });
    }
    return;
  }
  if (part.lowStockNotifiedAt) return;
  await prisma.sparePart.update({
    where: { id: part.id },
    data: { lowStockNotifiedAt: new Date() },
  });
  const named = serializeNamed(part);
  await notifyAdmins({
    message: `${named.name} is low on stock (${part.stockQuantity})`,
    code: "lowStock",
    sparePartId: part.id,
    roles: ["admin", "warehouse"],
    params: {
      ...named,
      stockQuantity: part.stockQuantity,
      lowStockThreshold: part.lowStockThreshold,
    },
  });
}
