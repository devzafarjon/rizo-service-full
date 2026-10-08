import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { pageInfo, parsePaging } from "../lib/paging.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { paymentFor } from "../lib/assignment.js";
import { computeWarrantyStatus, money, parseDateOnly, toDateOnly, voidedExpiry, warrantyExpiryFor } from "../lib/warranty.js";
import { OPEN_STATUSES } from "../lib/status.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { optionalText } from "../lib/zodFields.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { READ_MONEY, READ_OFFICE } from "../lib/roles.js";

const saleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid sale date"),
  pricePaid: z.coerce.number().nonnegative("Price cannot be negative"),
  warrantyMonths: z.coerce.number().int().min(0, "Warranty months cannot be negative").max(120).optional(),
  invoiceNumber: optionalText,
  serialNumber: z.string().trim().max(80).optional().nullable(),
});

export const salesRouter = Router();
salesRouter.use(staffAuth, readWriteRoles(READ_OFFICE, ["admin"]));

salesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const invoice = typeof req.query.invoice === "string" ? req.query.invoice.trim() : "";
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : "";
    const digits = q.replace(/\D/g, "");
    const where: Prisma.SaleWhereInput = {
        AND: [
          customerId ? { customerId } : {},
          invoice ? { invoiceNumber: { equals: invoice, mode: "insensitive" } } : {},
          q
            ? {
                OR: [
                  { invoiceNumber: { contains: q, mode: "insensitive" } },
                  { serialNumber: { contains: q, mode: "insensitive" } },
                  { customer: { name: { contains: q, mode: "insensitive" } } },
                  ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
                  { product: { name: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {},
        ],
    };
    const { take, skip } = parsePaging(req.query, 1000);
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: { saleDate: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: true,
          _count: { select: { requests: true } },
        },
        take,
        skip,
      }),
      prisma.sale.count({ where }),
    ]);
    res.json({ sales: sales.map(serializeSale), ...pageInfo(total, skip, sales.length) });
  }),
);

salesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        product: true,
        _count: { select: { requests: true } },
      },
    });
    if (!sale) {
      throw new HttpError(404, "Sale not found");
    }
    res.json({ sale: serializeSale(sale) });
  }),
);

salesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(saleSchema, req.body);
    const { product } = await assertCustomerAndProduct(body.customerId, body.productId);
    const saleDate = parseDateOnly(body.saleDate);
    const warrantyMonths = body.warrantyMonths ?? product.warrantyMonths;
    const warrantyExpiry = warrantyExpiryFor({ saleDate, installationDate: null, warrantyMonths, extensionMonths: 0 }, product);
    const serialNumber = body.serialNumber?.trim() || null;
    if (serialNumber && (await prisma.sale.findFirst({ where: { serialNumber, productId: product.id } }))) {
      throw new HttpError(409, "This serial number is already registered", "serialExists");
    }
    // An invoice number the office typed is used as is. A generated one is only a guess: two sales saved at the same moment
    // can guess the same number, so a clash is retried with a new one instead of failing the second sale.
    for (let attempt = 0; ; attempt += 1) {
      const invoiceNumber = body.invoiceNumber?.toUpperCase() || (await nextInvoiceNumber(attempt));
      try {
        const sale = await prisma.sale.create({
          data: {
            customerId: body.customerId,
            productId: body.productId,
            quantity: body.quantity,
            saleDate,
            pricePaid: body.pricePaid,
            warrantyMonths,
            warrantyExpiry,
            invoiceNumber,
            serialNumber,
          },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            product: true,
            _count: { select: { requests: true } },
          },
        });
        res.status(201).json({ sale: serializeSale(sale) });
        return;
      } catch (error) {
        if (!body.invoiceNumber && attempt < 8 && isInvoiceClash(error)) continue;
        handlePrismaError(error, { invoice_number: "This invoice number is already in use", invoiceNumber: "This invoice number is already in use" });
      }
    }
  }),
);

salesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(saleSchema.partial(), req.body);
    const existing = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw new HttpError(404, "Sale not found");
    }
    const customerId = body.customerId ?? existing.customerId;
    const productId = body.productId ?? existing.productId;
    const { product } = await assertCustomerAndProduct(customerId, productId);
    const saleDate = body.saleDate ? parseDateOnly(body.saleDate) : existing.saleDate;
    const warrantyMonths = body.warrantyMonths ?? existing.warrantyMonths;
    // Warranty runs from installation when the product counts from installation and has been installed.
    const warrantyExpiry = existing.voidedAt
      ? voidedExpiry(saleDate)
      : warrantyExpiryFor({ saleDate, installationDate: existing.installationDate, warrantyMonths, extensionMonths: existing.extensionMonths }, product);
    try {
      const sale = await prisma.sale.update({
        where: { id: existing.id },
        data: {
          customerId,
          productId,
          quantity: body.quantity ?? existing.quantity,
          saleDate,
          pricePaid: body.pricePaid ?? existing.pricePaid,
          warrantyMonths,
          warrantyExpiry,
          ...(body.serialNumber !== undefined ? { serialNumber: body.serialNumber?.trim() || null } : {}),
          ...(body.invoiceNumber ? { invoiceNumber: body.invoiceNumber.toUpperCase() } : {}),
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: true,
          _count: { select: { requests: true } },
        },
      });
      const warrantyStatus = computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry);
      const open = await prisma.serviceRequest.findMany({
        where: { saleId: sale.id, status: { in: OPEN_STATUSES } },
        select: { id: true, type: true },
      });
      for (const request of open) {
        const payment = paymentFor(request.type, warrantyStatus);
        await prisma.serviceRequest.update({
          where: { id: request.id },
          data: {
            warrantyStatus,
            isPaidRepair: payment.isPaidRepair,
            paymentStatus: payment.paymentStatus,
          },
        });
      }
      res.json({ sale: serializeSale(sale) });
    } catch (error) {
      handlePrismaError(error, { invoice_number: "This invoice number is already in use", invoiceNumber: "This invoice number is already in use" });
    }
  }),
);

salesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { requests: true } } },
    });
    if (!sale) {
      throw new HttpError(404, "Sale not found");
    }
    if (sale._count.requests > 0) {
      throw new HttpError(409, "This sale is linked to service requests and cannot be deleted");
    }
    await prisma.sale.delete({ where: { id: sale.id } });
    res.json({ ok: true });
  }),
);

salesRouter.post(
  "/:id/extend",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ months: z.coerce.number().int().min(1).max(60), reason: z.string().trim().min(1, "Give a reason").max(200) }), req.body);
    const sale = await loadSale(req.params.id);
    if (sale.voidedAt) throw new HttpError(400, "This warranty was voided", "warrantyVoided");
    const extensionMonths = sale.extensionMonths + body.months;
    const warrantyExpiry = warrantyExpiryFor({ ...sale, extensionMonths }, sale.product);
    const updated = await prisma.sale.update({
      where: { id: sale.id },
      data: { extensionMonths, extensionReason: body.reason, warrantyExpiry },
      include: saleInclude,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "sale.warranty.extend", entityType: "Sale", entityId: sale.id, oldValue: { warrantyExpiry: toDateOnly(sale.warrantyExpiry) }, newValue: { months: body.months, reason: body.reason, warrantyExpiry: toDateOnly(warrantyExpiry) } });
    res.json({ sale: serializeSale(updated) });
  }),
);

salesRouter.post(
  "/:id/void",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ reason: z.string().trim().min(1, "Give a reason").max(200) }), req.body);
    const sale = await loadSale(req.params.id);
    const updated = await prisma.sale.update({
      where: { id: sale.id },
      data: { voidedAt: new Date(), voidReason: body.reason, warrantyExpiry: voidedExpiry(sale.saleDate) },
      include: saleInclude,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "sale.warranty.void", entityType: "Sale", entityId: sale.id, oldValue: { warrantyExpiry: toDateOnly(sale.warrantyExpiry) }, newValue: { reason: body.reason } });
    res.json({ sale: serializeSale(updated) });
  }),
);

salesRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const sale = await loadSale(req.params.id);
    const warrantyExpiry = warrantyExpiryFor(sale, sale.product);
    const updated = await prisma.sale.update({
      where: { id: sale.id },
      data: { voidedAt: null, voidReason: null, warrantyExpiry },
      include: saleInclude,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "sale.warranty.restore", entityType: "Sale", entityId: sale.id, newValue: { warrantyExpiry: toDateOnly(warrantyExpiry) } });
    res.json({ sale: serializeSale(updated) });
  }),
);

salesRouter.post(
  "/:id/verify",
  asyncHandler(async (req, res) => {
    const sale = await loadSale(req.params.id);
    const updated = await prisma.sale.update({ where: { id: sale.id }, data: { isVerified: true }, include: saleInclude });
    await writeAudit({ actor: staffActor(req.staff), action: "sale.verify", entityType: "Sale", entityId: sale.id });
    res.json({ sale: serializeSale(updated) });
  }),
);

// Everything the printed warranty card (talon) needs.
salesRouter.get(
  "/:id/warranty-card",
  asyncHandler(async (req, res) => {
    const sale = await loadSale(req.params.id);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: sale.customerId }, select: { name: true, phone: true } });
    res.json({
      card: {
        invoiceNumber: sale.invoiceNumber,
        serialNumber: sale.serialNumber,
        saleDate: toDateOnly(sale.saleDate),
        installationDate: sale.installationDate ? toDateOnly(sale.installationDate) : null,
        warrantyMonths: sale.warrantyMonths + sale.extensionMonths,
        warrantyExpiry: toDateOnly(sale.warrantyExpiry),
        warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
        voided: Boolean(sale.voidedAt),
        voidReason: sale.voidReason,
        startsOn: sale.product.warrantyStartsOn,
        coversLabor: sale.product.warrantyCoversLabor,
        coversParts: sale.product.warrantyCoversParts,
        customer,
        product: { id: sale.product.id, name: sale.product.name, nameUz: sale.product.nameUz, nameRu: sale.product.nameRu, nameEn: sale.product.nameEn, sku: sale.product.sku, category: sale.product.category },
      },
    });
  }),
);

const saleInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  product: true,
  _count: { select: { requests: true } },
} as const;

async function loadSale(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: saleInclude });
  if (!sale) throw new HttpError(404, "Sale not found");
  return sale;
}

async function assertCustomerAndProduct(customerId: string, productId: string) {
  const [customer, product] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!customer) {
    throw new HttpError(400, "Customer not found");
  }
  if (!product) {
    throw new HttpError(400, "Product not found");
  }
  return { customer, product };
}

async function nextInvoiceNumber(attempt = 0) {
  const count = await prisma.sale.count();
  // Later attempts jump ahead by a random amount, so two sales that clashed do not clash again.
  const jump = attempt === 0 ? 0 : attempt * 3 + Math.floor(Math.random() * 25);
  for (let offset = 1; offset <= 20; offset += 1) {
    const candidate = `RZ-${String(1000 + count + jump + offset).padStart(4, "0")}`;
    const exists = await prisma.sale.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) {
      return candidate;
    }
  }
  return `RZ-${Date.now()}`;
}

function isInvoiceClash(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return (Array.isArray(target) ? target : [String(target ?? "")]).some((item) => String(item).includes("invoice"));
}

function serializeSale(sale: {
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  saleDate: Date;
  pricePaid: { toString(): string };
  warrantyMonths: number;
  warrantyExpiry: Date;
  installationDate: Date | null;
  serialNumber: string | null;
  source: string;
  isVerified: boolean;
  extensionMonths: number;
  extensionReason: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  invoiceNumber: string;
  createdAt: Date;
  customer: { id: string; name: string; phone: string };
  product: { id: string; name: string; sku: string; category: string };
  _count: { requests: number };
}) {
  return {
    id: sale.id,
    customerId: sale.customerId,
    productId: sale.productId,
    quantity: sale.quantity,
    saleDate: toDateOnly(sale.saleDate),
    pricePaid: money(sale.pricePaid),
    warrantyMonths: sale.warrantyMonths,
    warrantyExpiry: toDateOnly(sale.warrantyExpiry),
    installationDate: sale.installationDate ? toDateOnly(sale.installationDate) : null,
    serialNumber: sale.serialNumber,
    source: sale.source,
    isVerified: sale.isVerified,
    extensionMonths: sale.extensionMonths,
    extensionReason: sale.extensionReason,
    voided: Boolean(sale.voidedAt),
    voidReason: sale.voidReason,
    warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt.toISOString(),
    requestsCount: sale._count.requests,
    customer: sale.customer,
    product: sale.product,
  };
}
