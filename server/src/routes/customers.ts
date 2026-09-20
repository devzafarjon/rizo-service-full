import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { computeWarrantyStatus, money, toDateOnly } from "../lib/warranty.js";
import { isRegionCode, resolveRegionCode } from "../lib/regions.js";
import { optionalText } from "../lib/zodFields.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  address: optionalText,
  regionCode: optionalText.refine((value) => value == null || isRegionCode(value), "Unknown region code"),
  notes: optionalText,
  password: optionalText,
});

const updateSchema = createSchema.partial().extend({
  password: optionalText,
});

export const customersRouter = Router();
customersRouter.use(staffAuth, requireStaffRole("admin"));

customersRouter.get(
  "/lookup",
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(typeof req.query.phone === "string" ? req.query.phone : "");
    if (!phone) {
      throw new HttpError(400, "Enter a valid phone number");
    }
    const customer = await prisma.customer.findUnique({
      where: { phone },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    res.json({ customer: customer ? serializeCustomer(customer) : null });
  }),
);

customersRouter.get(
  "/duplicates",
  asyncHandler(async (req, res) => {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    const groups = new Map<string, typeof customers>();
    for (const row of customers) {
      const key = row.phone.slice(-9);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    res.json({
      groups: [...groups.values()]
        .filter((list) => list.length > 1)
        .map((list) => list.map(serializeCustomer)),
    });
  }),
);

customersRouter.post(
  "/merge",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ keepId: z.string(), absorbId: z.string() }), req.body);
    if (body.keepId === body.absorbId) {
      throw new HttpError(400, "Choose two different customers");
    }
    const keep = await prisma.customer.findUnique({ where: { id: body.keepId } });
    const absorb = await prisma.customer.findUnique({ where: { id: body.absorbId } });
    if (!keep || !absorb) throw new HttpError(404, "Customer not found");
    await prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.serviceRequest.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.feedback.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.notification.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.requestNote.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.requestPhoto.updateMany({ where: { customerId: absorb.id }, data: { customerId: keep.id } });
      await tx.customer.delete({ where: { id: absorb.id } });
    });
    const merged = await prisma.customer.findUniqueOrThrow({
      where: { id: keep.id },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    await writeAudit({
      actor: staffActor(req.staff),
      action: "customer.merge",
      entityType: "Customer",
      entityId: keep.id,
      oldValue: { absorbId: absorb.id, absorbPhone: absorb.phone },
      newValue: { keepId: keep.id, keepPhone: keep.phone },
    });
    res.json({ customer: serializeCustomer(merged) });
  }),
);

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const digits = normalizePhone(q);
    const customers = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              { name: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { sales: true, requests: true } },
      },
    });
    res.json({ customers: customers.map(serializeCustomer) });
  }),
);

customersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { sales: true, requests: true } },
        sales: {
          orderBy: { saleDate: "desc" },
          include: { product: true },
        },
        requests: {
          orderBy: { createdAt: "desc" },
          include: {
            product: true,
            assignedTechnician: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!customer) {
      throw new HttpError(404, "Customer not found");
    }
    res.json({
      customer: serializeCustomer(customer),
      sales: customer.sales.map((sale) => serializeSale(sale)),
      requests: customer.requests.map((request) => ({
        id: request.id,
        displayId: request.displayId,
        type: request.type,
        status: request.status,
        priority: request.priority,
        warrantyStatus: request.warrantyStatus,
        locationType: request.locationType,
        createdAt: request.createdAt.toISOString(),
        receivedAt: request.receivedAt?.toISOString() ?? null,
        acceptedAt: request.acceptedAt?.toISOString() ?? null,
        arrivedAt: request.arrivedAt?.toISOString() ?? null,
        completedAt: request.completedAt?.toISOString() ?? null,
        finalCost: request.finalCost == null ? null : money(request.finalCost),
        paymentStatus: request.paymentStatus,
        product: request.product,
        assignedTechnician: request.assignedTechnician,
      })),
    });
  }),
);

customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    const existing = await prisma.customer.findUnique({
      where: { phone },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    if (existing) {
      throw new HttpError(409, "A customer with this phone number already exists", "phoneExists", {
        customer: serializeCustomer(existing),
      });
    }
    const generated = body.password ? null : crypto.randomBytes(4).toString("hex");
    if (body.password && body.password.length < 6) {
      throw new HttpError(400, "Password must be at least 6 characters");
    }
    try {
      const customer = await prisma.customer.create({
        data: {
          name: body.name,
          phone,
          address: body.address,
          regionCode: resolveRegionCode(body.regionCode, body.address),
          notes: body.notes,
          passwordHash: await hashPassword(body.password ?? generated!),
        },
        include: { _count: { select: { sales: true, requests: true } } },
      });
      res.status(201).json({
        customer: serializeCustomer(customer),
        temporaryPassword: generated,
      });
    } catch (error) {
      handlePrismaError(error, { phone: "A customer with this phone number already exists" });
    }
  }),
);

customersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(updateSchema, req.body);
    const data: {
      name?: string;
      phone?: string;
      address?: string | null;
      regionCode?: string;
      notes?: string | null;
      passwordHash?: string;
    } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      assertPhone(phone);
      data.phone = phone;
    }
    if (body.address !== undefined) data.address = body.address ?? null;
    if (body.regionCode !== undefined || body.address !== undefined) {
      data.regionCode = resolveRegionCode(body.regionCode, body.address ?? data.address);
    }
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    if (body.password && body.password.length < 6) {
      throw new HttpError(400, "Password must be at least 6 characters");
    }
    if (body.password) data.passwordHash = await hashPassword(body.password);

    try {
      const customer = await prisma.customer.update({
        where: { id: req.params.id },
        data,
        include: { _count: { select: { sales: true, requests: true } } },
      });
      res.json({ customer: serializeCustomer(customer) });
    } catch (error) {
      handlePrismaError(error, { phone: "A customer with this phone number already exists" });
    }
  }),
);

customersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    if (!customer) {
      throw new HttpError(404, "Customer not found");
    }
    if (customer._count.sales > 0 || customer._count.requests > 0) {
      throw new HttpError(409, "This customer has sales or service history and cannot be deleted");
    }
    await prisma.customer.delete({ where: { id: customer.id } });
    res.json({ ok: true });
  }),
);

function serializeCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  regionCode: string;
  notes: string | null;
  createdAt: Date;
  _count: { sales: number; requests: number };
}) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    regionCode: customer.regionCode,
    notes: customer.notes,
    createdAt: customer.createdAt.toISOString(),
    salesCount: customer._count.sales,
    requestsCount: customer._count.requests,
  };
}

function serializeSale(sale: {
  id: string;
  invoiceNumber: string;
  quantity: number;
  saleDate: Date;
  pricePaid: { toString(): string };
  warrantyMonths: number;
  warrantyExpiry: Date;
  product: { id: string; name: string; sku: string; category: string };
}) {
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    quantity: sale.quantity,
    saleDate: toDateOnly(sale.saleDate),
    pricePaid: money(sale.pricePaid),
    warrantyMonths: sale.warrantyMonths,
    warrantyExpiry: toDateOnly(sale.warrantyExpiry),
    warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
    product: sale.product,
  };
}
