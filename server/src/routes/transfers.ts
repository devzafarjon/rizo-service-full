import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { canManage, canReceiveAt, requireManage, staffScope } from "../lib/warehouseAccess.js";
import { cancelTransfer, createTransfer, loadTransfer, receiveTransfer, rejectTransfer, serializeTransfer, shipTransfer, transferInclude } from "../lib/transfers.js";
import { homeWarehouseId } from "../lib/warehouses.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const transfersRouter = Router();
transfersRouter.use(staffAuth, readWriteRoles(["admin", "warehouse", "receptionist", "accountant"], ["admin", "warehouse", "receptionist"]));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Requests and shipments. `warehouseId` limits to one warehouse; `direction` is from its point of view.
transfersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const scope = await staffScope(req.staff!);
    const warehouseId = typeof req.query.warehouseId === "string" && req.query.warehouseId ? req.query.warehouseId : undefined;
    const direction = req.query.direction === "in" || req.query.direction === "out" ? req.query.direction : "all";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const where: Prisma.StockTransferWhereInput = {
      ...(status === "open" ? { status: { in: ["requested", "shipped"] } } : status === "history" ? { status: { in: ["received", "rejected", "cancelled"] } } : ["requested", "shipped", "received", "rejected", "cancelled"].includes(status) ? { status: status as "requested" } : {}),
      ...(warehouseId
        ? direction === "in"
          ? { toWarehouseId: warehouseId }
          : direction === "out"
            ? { fromWarehouseId: warehouseId }
            : { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] }
        : {}),
      ...(req.query.mine === "1" ? { requestedById: scope.id } : {}),
    };
    const rows = await prisma.stockTransfer.findMany({ where, include: transferInclude, orderBy: { createdAt: "desc" }, take: 300 });
    res.json({ transfers: rows.map(serializeTransfer) });
  }),
);

transfersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ transfer: serializeTransfer(await loadTransfer(req.params.id)) });
  }),
);

transfersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        sparePartId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(100000),
        fromWarehouseId: z.string().min(1),
        toWarehouseId: z.string().min(1).nullable().optional(),
        toTechnicianId: z.string().min(1).nullable().optional(),
        serviceRequestId: z.string().min(1).nullable().optional(),
        note: z.string().trim().max(200).nullable().optional(),
      }),
      req.body,
    );
    const scope = await staffScope(req.staff!);
    // A front-desk user (the branch's admin) asks for the warehouse of their own centre unless told otherwise.
    const toWarehouseId = body.toWarehouseId ?? (body.toTechnicianId ? null : await homeWarehouseId(prisma, { staffId: scope.id }));
    const row = await createTransfer({ ...body, toWarehouseId, actor: { id: scope.id, name: scope.name, role: scope.role } });
    res.status(201).json({ transfer: serializeTransfer(await loadTransfer(row.id)) });
  }),
);

transfersRouter.post(
  "/:id/ship",
  requireStaffRole("admin", "warehouse"),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ quantity: z.coerce.number().int().min(1).optional(), etaAt: date.optional().nullable() }), req.body ?? {});
    const scope = await staffScope(req.staff!);
    const row = await loadTransfer(req.params.id);
    requireManage(scope, row.fromWarehouseId);
    const sent = await shipTransfer({ id: row.id, quantity: body.quantity, etaAt: body.etaAt ?? null, actor: { id: scope.id, name: scope.name, role: scope.role } });
    res.json({ transfer: serializeTransfer(sent) });
  }),
);

transfersRouter.post(
  "/:id/receive",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ quantity: z.coerce.number().int().min(1).optional() }), req.body ?? {});
    const scope = await staffScope(req.staff!);
    const row = await loadTransfer(req.params.id);
    if (!row.toWarehouseId || !(await canReceiveAt(scope, row.toWarehouseId))) throw new HttpError(403, "You cannot confirm this delivery", "notYourWarehouse");
    const result = await receiveTransfer({ id: row.id, quantity: body.quantity, actor: { id: scope.id, name: scope.name, role: scope.role } });
    res.json({ transfer: serializeTransfer(result.transfer), released: result.released });
  }),
);

transfersRouter.post(
  "/:id/reject",
  requireStaffRole("admin", "warehouse"),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ reason: z.string().trim().min(1, "Write the reason").max(200) }), req.body);
    const scope = await staffScope(req.staff!);
    const row = await loadTransfer(req.params.id);
    requireManage(scope, row.fromWarehouseId);
    res.json({ transfer: serializeTransfer(await rejectTransfer({ id: row.id, reason: body.reason, actor: { id: scope.id, name: scope.name, role: scope.role } })) });
  }),
);

transfersRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const scope = await staffScope(req.staff!);
    const row = await loadTransfer(req.params.id);
    if (row.requestedById !== scope.id && !canManage(scope, row.fromWarehouseId)) throw new HttpError(403, "Only who asked (or the warehouse) can cancel this", "notYourWarehouse");
    res.json({ transfer: serializeTransfer(await cancelTransfer({ id: row.id, actor: { id: scope.id, name: scope.name, role: scope.role } })) });
  }),
);
