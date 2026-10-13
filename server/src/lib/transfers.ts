import type { Prisma } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { formatRequestId } from "./displayId.js";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { notifyKeepers, notifyStaffUser } from "./notifyStaff.js";
import { releaseWaitingJobs } from "./partsControl.js";
import { prisma } from "./prisma.js";
import { toDateOnly, parseDateOnly } from "./warranty.js";
import { addDaysTashkent, addStock, deliveryDays, stockAt, takeStock } from "./warehouses.js";
import { maybeAlertLowStock } from "./stockAlerts.js";
import { getAppSettings } from "./settings.js";

export type Requester = { id: string; name: string; role: string };
const STAFF_ROLES = ["admin", "receptionist", "technician", "warehouse", "accountant"];

const include = {
  sparePart: true,
  fromWarehouse: true,
  toWarehouse: true,
  toTechnician: { select: { id: true, name: true } },
  serviceRequest: { select: { id: true, displayId: true, status: true, customerId: true } },
} satisfies Prisma.StockTransferInclude;

type Row = Prisma.StockTransferGetPayload<{ include: typeof include }>;

function today() {
  return addDaysTashkent(0);
}

export function serializeTransfer(row: Row) {
  const eta = row.etaAt ? toDateOnly(row.etaAt) : null;
  return {
    id: row.id,
    status: row.status,
    quantity: row.quantity,
    part: { id: row.sparePart.id, ...serializeNamed(row.sparePart) },
    from: { id: row.fromWarehouse.id, name: row.fromWarehouse.name, kind: row.fromWarehouse.kind },
    to: row.toWarehouse ? { id: row.toWarehouse.id, name: row.toWarehouse.name, kind: row.toWarehouse.kind } : null,
    toTechnician: row.toTechnician,
    request: row.serviceRequest ? { id: row.serviceRequest.id, displayId: row.serviceRequest.displayId, status: row.serviceRequest.status } : null,
    etaAt: eta,
    late: row.status === "shipped" && eta != null && eta < today(),
    note: row.note,
    rejectionReason: row.rejectionReason,
    requestedBy: { id: row.requestedById, name: row.requestedByName, role: row.requestedByRole },
    shippedByName: row.shippedByName,
    createdAt: row.createdAt.toISOString(),
    shippedAt: row.shippedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
  };
}

export async function loadTransfer(id: string) {
  const row = await prisma.stockTransfer.findUnique({ where: { id }, include });
  if (!row) throw new HttpError(404, "Transfer not found");
  return row;
}

const auditActor = (actor: Requester): AuditActor => ({ id: actor.id, type: "staff", name: actor.name });

function params(row: Row, extra: Record<string, unknown> = {}) {
  return {
    ...serializeNamed(row.sparePart),
    qty: row.quantity,
    from: row.fromWarehouse.name,
    to: row.toWarehouse?.name ?? row.toTechnician?.name ?? "",
    who: row.requestedByName ?? "",
    displayId: row.serviceRequest?.displayId ?? "",
    ...extra,
  };
}

/** A warehouse (or a technician's van) asks another warehouse for a part. The keeper of the source is told. */
export async function createTransfer(input: {
  sparePartId: string;
  quantity: number;
  fromWarehouseId: string;
  toWarehouseId?: string | null;
  toTechnicianId?: string | null;
  serviceRequestId?: string | null;
  note?: string | null;
  actor: Requester;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new HttpError(400, "Quantity must be at least 1");
  if (Boolean(input.toWarehouseId) === Boolean(input.toTechnicianId)) throw new HttpError(400, "Choose a warehouse or a technician to deliver to", "transferTarget");
  if (input.toWarehouseId && input.toWarehouseId === input.fromWarehouseId) throw new HttpError(400, "A warehouse cannot send to itself", "transferSameWarehouse");
  const [part, from, to] = await Promise.all([
    prisma.sparePart.findUnique({ where: { id: input.sparePartId } }),
    prisma.warehouse.findUnique({ where: { id: input.fromWarehouseId } }),
    input.toWarehouseId ? prisma.warehouse.findUnique({ where: { id: input.toWarehouseId } }) : Promise.resolve(null),
  ]);
  if (!part) throw new HttpError(400, "Spare part not found");
  if (!from || !from.isActive) throw new HttpError(400, "Warehouse not found", "warehouseNotFound");
  if (input.toWarehouseId && (!to || !to.isActive)) throw new HttpError(400, "Warehouse not found", "warehouseNotFound");
  if (input.toTechnicianId) {
    const tech = await prisma.staffUser.findUnique({ where: { id: input.toTechnicianId }, select: { role: true, isActive: true } });
    if (!tech || tech.role !== "technician" || !tech.isActive) throw new HttpError(400, "Technician not found");
  }
  const row = await prisma.stockTransfer.create({
    data: {
      sparePartId: part.id,
      quantity: input.quantity,
      fromWarehouseId: from.id,
      toWarehouseId: to?.id ?? null,
      toTechnicianId: input.toTechnicianId ?? null,
      serviceRequestId: input.serviceRequestId ?? null,
      note: input.note ?? null,
      // Only staff accounts can be notified later; a customer or the system is recorded by name.
      requestedById: STAFF_ROLES.includes(input.actor.role) ? input.actor.id : null,
      requestedByName: input.actor.name,
      requestedByRole: input.actor.role,
    },
    include,
  });
  await writeAudit({ actor: auditActor(input.actor), action: "transfer.create", entityType: "StockTransfer", entityId: row.id, newValue: { part: part.name, quantity: row.quantity, from: from.name, to: to?.name ?? "technician" } });
  await notifyKeepers(from.id, {
    message: `${input.actor.name} asks ${from.name} for ${row.quantity} × ${part.name}`,
    code: "transferRequested",
    sparePartId: part.id,
    serviceRequestId: row.serviceRequestId,
    params: params(row),
  });
  return row;
}

/** The source warehouse sends the goods: stock leaves its shelf (all, or only `quantity`; the rest stays requested). */
export async function shipTransfer(input: { id: string; quantity?: number; etaAt?: string | null; actor: Requester }) {
  const row = await loadTransfer(input.id);
  if (row.status !== "requested") throw new HttpError(400, "This transfer is not waiting to be sent", "transferNotRequested");
  const quantity = input.quantity ?? row.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > row.quantity) throw new HttpError(400, "Quantity must be between 1 and the requested quantity", "transferQuantityInvalid");
  const etaDays = row.toWarehouse ? deliveryDays(row.fromWarehouse, row.toWarehouse) : row.fromWarehouse.leadDaysSameRegion;
  const etaAt = parseDateOnly(input.etaAt ?? addDaysTashkent(etaDays));

  await prisma.$transaction(async (tx) => {
    // Claim the request first: of several people pressing "send" at once, only one gets past this line (the others roll back).
    const claim = await tx.stockTransfer.updateMany({ where: { id: row.id, status: "requested" }, data: { status: "shipped" } });
    if (claim.count === 0) throw new HttpError(400, "This transfer is not waiting to be sent", "transferNotRequested");
    const ok = await takeStock(tx, row.fromWarehouseId, row.sparePartId, quantity, { kind: "transfer_out", transferId: row.id, by: { id: input.actor.id, name: input.actor.name }, serviceRequestId: row.serviceRequestId });
    if (!ok) {
      const count = await stockAt(tx, row.fromWarehouseId, row.sparePartId);
      throw new HttpError(400, `Only ${count} in stock at ${row.fromWarehouse.name}`, "transferStockInsufficient", { count });
    }
    if (quantity < row.quantity) {
      // What could not be sent stays requested as its own request.
      await tx.stockTransfer.create({
        data: {
          sparePartId: row.sparePartId, quantity: row.quantity - quantity, fromWarehouseId: row.fromWarehouseId, toWarehouseId: row.toWarehouseId, toTechnicianId: row.toTechnicianId,
          serviceRequestId: row.serviceRequestId, note: row.note, requestedById: row.requestedById, requestedByName: row.requestedByName, requestedByRole: row.requestedByRole,
        },
      });
    }
    await tx.stockTransfer.update({ where: { id: row.id }, data: { status: "shipped", quantity, shippedAt: new Date(), shippedByName: input.actor.name, etaAt } });
  });
  await maybeAlertLowStock(row.sparePartId);

  const sent = await loadTransfer(row.id);
  const date = toDateOnly(etaAt);
  await writeAudit({ actor: auditActor(input.actor), action: "transfer.ship", entityType: "StockTransfer", entityId: row.id, newValue: { quantity, eta: date } });
  // The people who wait for it hear it: whoever asked, the receiving keepers, and the customer of the job.
  const message = `${row.sparePart.name} (${quantity}) is on its way from ${row.fromWarehouse.name}, expected by ${date}`;
  if (row.requestedById && row.requestedById !== input.actor.id) {
    await notifyStaffUser(row.requestedById, { message, code: "transferShipped", sparePartId: row.sparePartId, serviceRequestId: row.serviceRequestId, params: params(sent, { date }) });
  }
  if (row.toWarehouseId) await notifyKeepers(row.toWarehouseId, { message, code: "transferShipped", sparePartId: row.sparePartId, serviceRequestId: row.serviceRequestId, params: params(sent, { date }) });
  if (row.serviceRequest) {
    await createCustomerNotification(row.serviceRequest.customerId, row.serviceRequest.id, `The spare part for ${formatRequestId(row.serviceRequest.displayId)} is on its way, expected by ${date}`, "partEta", { displayId: row.serviceRequest.displayId, date, ...serializeNamed(row.sparePart) });
  }
  return sent;
}

/** The goods are in hand: stock goes up at the destination (or onto the technician's van) and waiting jobs continue. */
export async function receiveTransfer(input: { id: string; quantity?: number; actor: Requester }) {
  const row = await loadTransfer(input.id);
  if (row.status !== "shipped") throw new HttpError(400, "This transfer is not on its way", "transferNotShipped");
  const received = input.quantity ?? row.quantity;
  if (!Number.isInteger(received) || received < 1 || received > row.quantity) throw new HttpError(400, "Received quantity must be between 1 and the sent quantity", "transferQuantityInvalid");
  const by = { id: input.actor.id, name: input.actor.name };

  await prisma.$transaction(async (tx) => {
    // Claim the delivery first: a second "received" at the same moment finds it taken and rolls back.
    const claim = await tx.stockTransfer.updateMany({ where: { id: row.id, status: "shipped" }, data: { status: "received" } });
    if (claim.count === 0) throw new HttpError(400, "This transfer is not on its way", "transferNotShipped");
    if (row.toWarehouseId) {
      await addStock(tx, row.toWarehouseId, row.sparePartId, received, { kind: "transfer_in", transferId: row.id, by, serviceRequestId: row.serviceRequestId });
    } else if (row.toTechnicianId) {
      await tx.technicianStock.upsert({
        where: { technicianId_sparePartId: { technicianId: row.toTechnicianId, sparePartId: row.sparePartId } },
        update: { quantity: { increment: received } },
        create: { technicianId: row.toTechnicianId, sparePartId: row.sparePartId, quantity: received },
      });
      await tx.stockMovement.create({ data: { sparePartId: row.sparePartId, technicianId: row.toTechnicianId, transferId: row.id, kind: "issue", quantity: received, createdById: by.id, createdByName: by.name, note: row.fromWarehouse.name } });
    }
    // Whatever did not arrive goes back to the shelf it left.
    if (received < row.quantity) await addStock(tx, row.fromWarehouseId, row.sparePartId, row.quantity - received, { kind: "transfer_back", transferId: row.id, by });
    await tx.stockTransfer.update({ where: { id: row.id }, data: { status: "received", receivedAt: new Date(), quantity: received } });
  });
  await writeAudit({ actor: auditActor(input.actor), action: "transfer.receive", entityType: "StockTransfer", entityId: row.id, newValue: { quantity: received } });
  await maybeAlertLowStock(row.sparePartId);
  const released = row.toWarehouseId
    ? await releaseWaitingJobs({ partId: row.sparePartId, linkedRequestId: row.serviceRequestId, ignoreTransferId: row.id, actor: auditActor(input.actor) })
    : [];
  return { transfer: await loadTransfer(row.id), released };
}

/** The source cannot send it. A job that waits for the part is rerouted to the next best source (or the supplier). */
export async function rejectTransfer(input: { id: string; reason: string; actor: Requester }) {
  const row = await loadTransfer(input.id);
  if (row.status !== "requested") throw new HttpError(400, "This transfer is not waiting to be sent", "transferNotRequested");
  const claim = await prisma.stockTransfer.updateMany({ where: { id: row.id, status: "requested" }, data: { status: "rejected", rejectionReason: input.reason } });
  if (claim.count === 0) throw new HttpError(400, "This transfer is not waiting to be sent", "transferNotRequested");
  await writeAudit({ actor: auditActor(input.actor), action: "transfer.reject", entityType: "StockTransfer", entityId: row.id, newValue: { reason: input.reason } });
  if (row.requestedById && row.requestedById !== input.actor.id) {
    await notifyStaffUser(row.requestedById, {
      message: `${row.fromWarehouse.name} cannot send ${row.sparePart.name}: ${input.reason}`,
      code: "transferRejected",
      sparePartId: row.sparePartId,
      serviceRequestId: row.serviceRequestId,
      params: params(row, { reason: input.reason }),
    });
  }
  if (row.serviceRequestId && row.toWarehouseId) {
    const { sourceMissingPart } = await import("./partSourcing.js");
    await sourceMissingPart({ requestId: row.serviceRequestId, sparePartId: row.sparePartId, quantity: row.quantity, excludeWarehouseIds: [row.fromWarehouseId], note: `Rerouted: ${row.fromWarehouse.name} could not send`, actor: input.actor });
  }
  return loadTransfer(row.id);
}

/** The requester (or an admin) withdraws a request that was not sent yet. */
export async function cancelTransfer(input: { id: string; actor: Requester }) {
  const row = await loadTransfer(input.id);
  if (row.status !== "requested") throw new HttpError(400, "Only a request that was not sent can be cancelled", "transferNotRequested");
  const claim = await prisma.stockTransfer.updateMany({ where: { id: row.id, status: "requested" }, data: { status: "cancelled" } });
  if (claim.count === 0) throw new HttpError(400, "Only a request that was not sent can be cancelled", "transferNotRequested");
  await writeAudit({ actor: auditActor(input.actor), action: "transfer.cancel", entityType: "StockTransfer", entityId: row.id });
  return loadTransfer(row.id);
}

let lastWatch = 0;

/**
 * Reminders for the people who move parts: a request nobody sent for too long (the keeper of the source), and a shipment
 * past its promised date (the receiving keepers, the requester and, for a job, the customer).
 */
export async function runTransferWatch(force = false) {
  if (!force && Date.now() - lastWatch < 10 * 60_000) return null;
  lastWatch = Date.now();
  const settings = await getAppSettings();
  const result = { stale: 0, late: 0 };

  const stale = await prisma.stockTransfer.findMany({
    where: { status: "requested", staleNotifiedAt: null, createdAt: { lt: new Date(Date.now() - settings.transferShipHours * 3_600_000) } },
    include,
  });
  for (const row of stale) {
    await prisma.stockTransfer.update({ where: { id: row.id }, data: { staleNotifiedAt: new Date() } });
    const hours = Math.floor((Date.now() - row.createdAt.getTime()) / 3_600_000);
    await notifyKeepers(row.fromWarehouseId, {
      message: `The request for ${row.quantity} × ${row.sparePart.name} from ${row.requestedByName ?? "?"} has waited ${hours} h`,
      code: "transferStale",
      sparePartId: row.sparePartId,
      serviceRequestId: row.serviceRequestId,
      params: params(row, { hours }),
    });
    result.stale += 1;
  }

  const late = await prisma.stockTransfer.findMany({ where: { status: "shipped", lateNotifiedAt: null, etaAt: { lt: parseDateOnly(today()) } }, include });
  for (const row of late) {
    await prisma.stockTransfer.update({ where: { id: row.id }, data: { lateNotifiedAt: new Date() } });
    const date = row.etaAt ? toDateOnly(row.etaAt) : "";
    const message = `${row.sparePart.name} (${row.quantity}) from ${row.fromWarehouse.name} is late (expected ${date})`;
    if (row.toWarehouseId) await notifyKeepers(row.toWarehouseId, { message, code: "transferLate", sparePartId: row.sparePartId, serviceRequestId: row.serviceRequestId, params: params(row, { date }) });
    if (row.requestedById) await notifyStaffUser(row.requestedById, { message, code: "transferLate", sparePartId: row.sparePartId, serviceRequestId: row.serviceRequestId, params: params(row, { date }) });
    if (row.serviceRequest) {
      await createCustomerNotification(row.serviceRequest.customerId, row.serviceRequest.id, `The spare part for ${formatRequestId(row.serviceRequest.displayId)} is late, sorry for the delay`, "partLate", { displayId: row.serviceRequest.displayId });
    }
    result.late += 1;
  }
  return result;
}

export { include as transferInclude };
