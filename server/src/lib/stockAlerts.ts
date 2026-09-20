import { serializeNamed } from "./named.js";
import { notifyAdmins } from "./notifyStaff.js";
import { prisma } from "./prisma.js";

export async function maybeAlertLowStock(partId: string) {
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
    params: {
      ...named,
      stockQuantity: part.stockQuantity,
      lowStockThreshold: part.lowStockThreshold,
    },
  });
}
