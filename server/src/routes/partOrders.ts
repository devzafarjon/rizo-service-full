import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { createPartOrder } from "../lib/partOrders.js";
import { orderRecommendations, partsOverview, receivePartOrder, tellCustomerAboutOrder, waitingRequests } from "../lib/partsControl.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { parseDateOnly, toDateOnly } from "../lib/warranty.js";
import { tashkentCalendarDate } from "../lib/displayId.js";

export const partOrdersRouter = Router();
partOrdersRouter.use(staffAuth, requireStaffRole("admin", "receptionist", "warehouse"));

const include = {
  sparePart: true,
  supplierRef: true,
  warehouse: { select: { id: true, name: true } },
  serviceRequest: { select: { id: true, displayId: true, status: true } },
} as const;

function serialize(order: Awaited<ReturnType<typeof load>>) {
  return {
    id: order.id,
    quantity: order.quantity,
    status: order.status,
    supplier: order.supplierRef?.name ?? order.supplier,
    supplierId: order.supplierId,
    warehouse: order.warehouse,
    note: order.note,
    expectedAt: order.expectedAt ? toDateOnly(order.expectedAt) : null,
    late: Boolean(order.expectedAt && (order.status === "requested" || order.status === "ordered") && toDateOnly(order.expectedAt) < tashkentCalendarDate(new Date())),
    orderedAt: order.orderedAt?.toISOString() ?? null,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    part: { id: order.sparePart.id, ...serializeNamed(order.sparePart), stockQuantity: order.sparePart.stockQuantity },
    request: order.serviceRequest,
  };
}

async function load(id: string) {
  const order = await prisma.partOrder.findUnique({ where: { id }, include });
  if (!order) throw new HttpError(404, "Part order not found");
  return order;
}

partOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const warehouseId = typeof req.query.warehouseId === "string" && req.query.warehouseId ? req.query.warehouseId : undefined;
    const orders = await prisma.partOrder.findMany({
      where: {
        ...(status === "open" ? { status: { in: ["requested", "ordered"] } } : ["requested", "ordered", "received", "cancelled"].includes(status) ? { status: status as "requested" } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include,
      take: 300,
    });
    // Who asked for each order (a technician, a branch admin, the warehouse ...).
    const askers = await prisma.staffUser.findMany({ where: { id: { in: orders.map((order) => order.createdById).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true, role: true } });
    const askerBy = new Map(askers.map((row) => [row.id, row]));
    res.json({ orders: orders.map((order) => ({ ...serialize(order), requestedBy: order.createdById ? (askerBy.get(order.createdById) ?? null) : null })) });
  }),
);

// The numbers at the top of the parts page.
partOrdersRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json({ overview: await partsOverview() });
  }),
);

// Jobs held up by a part: what they need, what is ordered, which have nothing ordered at all.
partOrdersRouter.get(
  "/waiting",
  asyncHandler(async (_req, res) => {
    const requests = await waitingRequests();
    res.json({ requests: requests.sort((a, b) => Number(b.noOrder) - Number(a.noOrder) || Number(b.late) - Number(a.late) || b.waitingDays - a.waitingDays) });
  }),
);

// What to buy next, grouped by supplier.
partOrdersRouter.get(
  "/recommendations",
  asyncHandler(async (_req, res) => {
    res.json({ groups: await orderRecommendations() });
  }),
);

// Turns the recommendations (or a chosen part of them) into orders in one go.
partOrdersRouter.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        items: z.array(z.object({ sparePartId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(9999) })).min(1).max(100),
        supplierId: z.string().optional().nullable(),
        markOrdered: z.boolean().optional(),
        expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      }),
      req.body,
    );
    const supplier = body.supplierId ? await prisma.supplier.findUnique({ where: { id: body.supplierId } }) : null;
    if (body.supplierId && !supplier) throw new HttpError(404, "Supplier not found");
    const expected = body.expectedAt ? parseDateOnly(body.expectedAt) : supplier ? new Date(Date.parse(`${tashkentCalendarDate(new Date())}T00:00:00Z`) + supplier.leadTimeDays * 86_400_000) : null;
    const created = [];
    for (const item of body.items) {
      const order = await createPartOrder({ sparePartId: item.sparePartId, quantity: item.quantity, supplierId: supplier?.id ?? null, supplier: supplier?.name ?? null, expectedAt: expected, createdById: req.staff!.sub });
      if (body.markOrdered) await prisma.partOrder.update({ where: { id: order.id }, data: { status: "ordered", orderedAt: new Date() } });
      created.push(order.id);
    }
    await writeAudit({ actor: staffActor(req.staff), action: "partOrder.bulk", entityType: "PartOrder", entityId: created[0]!, newValue: { count: created.length, supplier: supplier?.name ?? null } });
    res.status(201).json({ created: created.length });
  }),
);

partOrdersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        sparePartId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(9999),
        supplier: z.string().trim().max(100).optional().nullable(),
        supplierId: z.string().optional().nullable(),
        warehouseId: z.string().optional().nullable(),
        note: z.string().trim().max(200).optional().nullable(),
        expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        serviceRequestId: z.string().optional().nullable(),
      }),
      req.body,
    );
    const created = await createPartOrder({
      sparePartId: body.sparePartId,
      quantity: body.quantity,
      supplier: body.supplier,
      supplierId: body.supplierId ?? null,
      warehouseId: body.warehouseId ?? null,
      note: body.note,
      expectedAt: body.expectedAt ? parseDateOnly(body.expectedAt) : null,
      serviceRequestId: body.serviceRequestId ?? null,
      createdById: req.staff!.sub,
    });
    res.status(201).json({ order: serialize(await load(created.id)) });
  }),
);

partOrdersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        status: z.enum(["requested", "ordered", "received", "cancelled"]).optional(),
        supplier: z.string().trim().max(100).optional().nullable(),
        supplierId: z.string().optional().nullable(),
        expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        receivedQuantity: z.coerce.number().int().min(1).max(9999).optional(),
      }),
      req.body,
    );
    const order = await load(req.params.id);
    if (order.status === "received" || order.status === "cancelled") throw new HttpError(400, "This order is closed", "orderClosed");
    if (body.status === "received") {
      // The goods arrive: stock goes up, waiting jobs pick the parts up and continue.
      await receivePartOrder({ orderId: order.id, receivedQuantity: body.receivedQuantity, actor: staffActor(req.staff) });
    } else {
      const supplierChange = body.supplierId !== undefined ? (body.supplierId ? await prisma.supplier.findUnique({ where: { id: body.supplierId } }) : null) : undefined;
      if (body.supplierId && !supplierChange) throw new HttpError(404, "Supplier not found");
      const dateChanged = body.expectedAt !== undefined && (body.expectedAt ?? null) !== (order.expectedAt ? toDateOnly(order.expectedAt) : null);
      await prisma.partOrder.update({
        where: { id: order.id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.status === "ordered" && !order.orderedAt ? { orderedAt: new Date() } : {}),
          ...(supplierChange !== undefined ? { supplierId: supplierChange?.id ?? null, supplier: supplierChange?.name ?? null } : body.supplier !== undefined ? { supplier: body.supplier } : {}),
          ...(body.expectedAt !== undefined ? { expectedAt: body.expectedAt ? parseDateOnly(body.expectedAt) : null, lateNotifiedAt: null } : {}),
        },
      });
      // The customer hears when the order is placed and whenever the promised date changes.
      if (order.serviceRequestId && body.status !== "cancelled" && ((body.status === "ordered" && order.status !== "ordered") || (dateChanged && body.expectedAt))) {
        await tellCustomerAboutOrder(order.id);
      }
    }
    await writeAudit({ actor: staffActor(req.staff), action: "partOrder.update", entityType: "PartOrder", entityId: order.id, newValue: { status: body.status ?? order.status } });
    res.json({ order: serialize(await load(order.id)) });
  }),
);

export { requireStaffRole };
