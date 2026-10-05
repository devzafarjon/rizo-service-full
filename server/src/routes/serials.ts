import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { computeWarrantyStatus, toDateOnly, money } from "../lib/warranty.js";
import { requireOffice, staffAuth } from "../middleware/staffAuth.js";

export const serialsRouter = Router();
serialsRouter.use(staffAuth, requireOffice);

// One page per unit: who bought it, how long it is covered, and every visit to the service.
serialsRouter.get(
  "/:serial",
  asyncHandler(async (req, res) => {
    const serial = req.params.serial.trim();
    const sales = await prisma.sale.findMany({
      where: { serialNumber: { equals: serial, mode: "insensitive" } },
      include: { customer: { select: { id: true, name: true, phone: true } }, product: true },
      orderBy: { saleDate: "desc" },
    });
    const requests = await prisma.serviceRequest.findMany({
      where: { OR: [{ serialNumber: { equals: serial, mode: "insensitive" } }, ...(sales.length ? [{ saleId: { in: sales.map((sale) => sale.id) } }] : [])] },
      orderBy: { createdAt: "desc" },
      include: { product: true, customer: { select: { id: true, name: true } } },
    });
    if (sales.length === 0 && requests.length === 0) throw new HttpError(404, "No unit with this serial number", "serialNotFound");
    const repairs = requests.filter((request) => request.type === "repair");
    res.json({
      serial,
      sales: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: toDateOnly(sale.saleDate),
        installationDate: sale.installationDate ? toDateOnly(sale.installationDate) : null,
        warrantyExpiry: toDateOnly(sale.warrantyExpiry),
        warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
        warrantyMonths: sale.warrantyMonths + sale.extensionMonths,
        voided: Boolean(sale.voidedAt),
        voidReason: sale.voidReason,
        isVerified: sale.isVerified,
        source: sale.source,
        pricePaid: money(sale.pricePaid),
        customer: sale.customer,
        product: { id: sale.product.id, ...serializeNamed(sale.product), sku: sale.product.sku },
      })),
      requests: requests.map((request) => ({
        id: request.id,
        displayId: request.displayId,
        type: request.type,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
        completedAt: request.completedAt?.toISOString() ?? null,
        isRepeat: request.isRepeat,
        issueDescription: request.issueDescription,
        finalCost: request.finalCost == null ? null : money(request.finalCost),
        customer: request.customer,
        product: { id: request.product.id, ...serializeNamed(request.product) },
      })),
      summary: { repairs: repairs.length, repeats: repairs.filter((request) => request.isRepeat).length },
    });
  }),
);
