import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { normalizeDisplayIdQuery } from "../lib/displayId.js";
import { normalizePhone } from "../lib/phone.js";
import { prisma } from "../lib/prisma.js";
import { computeWarrantyStatus, money, toDateOnly } from "../lib/warranty.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const searchRouter = Router();
searchRouter.use(staffAuth, requireStaffRole("admin"));

searchRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) {
      res.json({ customers: [], sales: [], requests: [] });
      return;
    }
    const digits = normalizePhone(q);
    const displayId = normalizeDisplayIdQuery(q);
    const [customers, sales, requests] = await Promise.all([
      prisma.customer.findMany({
        where: {
          OR: [
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        },
        take: 8,
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, address: true, regionCode: true },
      }),
      prisma.sale.findMany({
        where: {
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
          ],
        },
        take: 8,
        orderBy: { saleDate: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true, nameUz: true, nameRu: true, nameEn: true, sku: true } },
        },
      }),
      prisma.serviceRequest.findMany({
        where: {
          OR: [
            { displayId: { contains: displayId, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          displayId: true,
          status: true,
          type: true,
          customer: { select: { name: true } },
          product: { select: { name: true, nameUz: true, nameRu: true, nameEn: true } },
        },
      }),
    ]);

    res.json({
      customers,
      sales: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: toDateOnly(sale.saleDate),
        pricePaid: money(sale.pricePaid),
        warrantyExpiry: toDateOnly(sale.warrantyExpiry),
        warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
        customer: sale.customer,
        product: sale.product,
      })),
      requests: requests.map((request) => ({
        id: request.id,
        displayId: request.displayId,
        status: request.status,
        type: request.type,
        customerName: request.customer.name,
        productName: request.product.name,
        product: request.product,
      })),
    });
  }),
);
