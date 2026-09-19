import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { paymentFor } from "../lib/assignment.js";
import { computeWarrantyExpiry, computeWarrantyStatus, money, parseDateOnly, toDateOnly } from "../lib/warranty.js";
import { optionalText } from "../lib/zodFields.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const saleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  productId: z.string().min(1, "Product is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid sale date"),
  pricePaid: z.coerce.number().nonnegative("Price cannot be negative"),
  warrantyMonths: z.coerce.number().int().min(0, "Warranty months cannot be negative").max(120),
  invoiceNumber: optionalText,
});

export const salesRouter = Router();
salesRouter.use(staffAuth, requireStaffRole("admin"));

salesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const invoice = typeof req.query.invoice === "string" ? req.query.invoice.trim() : "";
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : "";
    const digits = q.replace(/\D/g, "");
    const sales = await prisma.sale.findMany({
      where: {
        AND: [
          customerId ? { customerId } : {},
          invoice ? { invoiceNumber: { equals: invoice, mode: "insensitive" } } : {},
          q
            ? {
                OR: [
                  { invoiceNumber: { contains: q, mode: "insensitive" } },
                  { customer: { name: { contains: q, mode: "insensitive" } } },
                  ...(digits.length >= 3 ? [{ customer: { phone: { contains: digits } } }] : []),
                  { product: { name: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {},
        ],
      },
      orderBy: { saleDate: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        product: true,
        _count: { select: { requests: true } },
      },
    });
    res.json({ sales: sales.map(serializeSale) });
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
    await assertCustomerAndProduct(body.customerId, body.productId);
    const saleDate = parseDateOnly(body.saleDate);
    const warrantyExpiry = computeWarrantyExpiry(saleDate, body.warrantyMonths);
    const invoiceNumber = body.invoiceNumber?.toUpperCase() || (await nextInvoiceNumber());
    try {
      const sale = await prisma.sale.create({
        data: {
          customerId: body.customerId,
          productId: body.productId,
          quantity: body.quantity,
          saleDate,
          pricePaid: body.pricePaid,
          warrantyMonths: body.warrantyMonths,
          warrantyExpiry,
          invoiceNumber,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          product: true,
          _count: { select: { requests: true } },
        },
      });
      res.status(201).json({ sale: serializeSale(sale) });
    } catch (error) {
      handlePrismaError(error, { invoice_number: "This invoice number is already in use", invoiceNumber: "This invoice number is already in use" });
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
    await assertCustomerAndProduct(customerId, productId);
    const saleDate = body.saleDate ? parseDateOnly(body.saleDate) : existing.saleDate;
    const warrantyMonths = body.warrantyMonths ?? existing.warrantyMonths;
    const warrantyExpiry = computeWarrantyExpiry(saleDate, warrantyMonths);
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
        where: { saleId: sale.id, status: { notIn: ["completed", "closed", "replaced"] } },
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
}

async function nextInvoiceNumber() {
  const count = await prisma.sale.count();
  for (let offset = 1; offset <= 20; offset += 1) {
    const candidate = `RZ-${String(1000 + count + offset).padStart(4, "0")}`;
    const exists = await prisma.sale.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) {
      return candidate;
    }
  }
  return `RZ-${Date.now()}`;
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
    warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt.toISOString(),
    requestsCount: sale._count.requests,
    customer: sale.customer,
    product: sale.product,
  };
}
