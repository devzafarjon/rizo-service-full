import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { createPartOrder, maybeAlertLowStock } from "../lib/partOrders.js";
import { fulfilPendingParts } from "../lib/estimates.js";
import { changeRequestStatus } from "../lib/statusChange.js";
import { createCustomerNotification } from "../lib/notifyCustomer.js";
import { requireStaffRole, staffAuth, requireOffice } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { parseDateOnly, toDateOnly } from "../lib/warranty.js";

export const partOrdersRouter = Router();
partOrdersRouter.use(staffAuth, requireStaffRole("admin", "receptionist", "warehouse"));

const include = {
  sparePart: true,
  serviceRequest: { select: { id: true, displayId: true, status: true } },
} as const;

function serialize(order: Awaited<ReturnType<typeof load>>) {
  return {
    id: order.id,
    quantity: order.quantity,
    status: order.status,
    supplier: order.supplier,
    note: order.note,
    expectedAt: order.expectedAt ? toDateOnly(order.expectedAt) : null,
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
    const orders = await prisma.partOrder.findMany({
      where: status === "open" ? { status: { in: ["requested", "ordered"] } } : ["requested", "ordered", "received", "cancelled"].includes(status) ? { status: status as "requested" } : {},
      orderBy: { createdAt: "desc" },
      include,
      take: 300,
    });
    // Parts running low with nothing on order are suggestions for the next supplier order.
    const low = (await prisma.sparePart.findMany({ orderBy: { name: "asc" } })).filter((part) => part.stockQuantity <= part.lowStockThreshold);
    const open = await prisma.partOrder.groupBy({ by: ["sparePartId"], where: { status: { in: ["requested", "ordered"] } }, _sum: { quantity: true } });
    const onOrder = new Map(open.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
    res.json({
      orders: orders.map(serialize),
      suggestions: low
        .filter((part) => (onOrder.get(part.id) ?? 0) === 0)
        .map((part) => ({ id: part.id, ...serializeNamed(part), stockQuantity: part.stockQuantity, lowStockThreshold: part.lowStockThreshold })),
    });
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
        expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      }),
      req.body,
    );
    const order = await load(req.params.id);
    if (order.status === "received" || order.status === "cancelled") throw new HttpError(400, "This order is closed", "orderClosed");
    if (body.status === "received") {
      // The goods arrive: stock goes up, waiting jobs pick the parts up and continue.
      await prisma.$transaction([
        prisma.sparePart.update({ where: { id: order.sparePartId }, data: { stockQuantity: { increment: order.quantity } } }),
        prisma.partOrder.update({ where: { id: order.id }, data: { status: "received", receivedAt: new Date() } }),
      ]);
      await maybeAlertLowStock(order.sparePartId);
      if (order.serviceRequestId) {
        const result = await fulfilPendingParts(order.serviceRequestId);
        const request = await prisma.serviceRequest.findUnique({ where: { id: order.serviceRequestId } });
        if (request?.status === "awaiting_parts" && result.pending === 0) {
          await changeRequestStatus({ requestId: request.id, next: "in_progress", actor: { audit: staffActor(req.staff), role: "system" } });
          await createCustomerNotification(request.customerId, request.id, "The part has arrived, we are continuing the repair", "partArrived", { displayId: request.displayId });
        }
      }
    } else {
      await prisma.partOrder.update({
        where: { id: order.id },
        data: {
          ...(body.status ? { status: body.status } : {}),
          ...(body.supplier !== undefined ? { supplier: body.supplier } : {}),
          ...(body.expectedAt !== undefined ? { expectedAt: body.expectedAt ? parseDateOnly(body.expectedAt) : null } : {}),
        },
      });
    }
    await writeAudit({ actor: staffActor(req.staff), action: "partOrder.update", entityType: "PartOrder", entityId: order.id, newValue: { status: body.status ?? order.status } });
    res.json({ order: serialize(await load(order.id)) });
  }),
);

export { requireStaffRole };
