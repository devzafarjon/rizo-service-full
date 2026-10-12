import { HttpError } from "./httpError.js";
import { createPartOrder } from "./partOrders.js";
import { prisma } from "./prisma.js";
import { createTransfer, type Requester } from "./transfers.js";
import { homeWarehouseForRequest, rankSources, type SourceOption } from "./warehouses.js";

export type SourcePreference = { type: "warehouse"; warehouseId: string } | { type: "supplier" };

const SYSTEM: Requester = { id: "system", name: "System", role: "system" };

/**
 * A job needs a part its own warehouse does not have. Finds the fastest warehouse that holds it and asks it to send the part
 * to the job's warehouse; if nobody can, the part is ordered from the supplier straight to the job's warehouse.
 */
export async function sourceMissingPart(input: {
  requestId: string;
  sparePartId: string;
  quantity: number;
  prefer?: SourcePreference | null;
  excludeWarehouseIds?: string[];
  note?: string | null;
  actor?: Requester | null;
}) {
  const job = await prisma.serviceRequest.findUnique({ where: { id: input.requestId }, select: { id: true, displayId: true, assignedTechnicianId: true, serviceCenterId: true } });
  if (!job) throw new HttpError(404, "Request not found");
  const home = await homeWarehouseForRequest(prisma, job);
  const options = await rankSources(prisma, { partId: input.sparePartId, quantity: input.quantity, toWarehouseId: home, excludeWarehouseIds: input.excludeWarehouseIds });

  let choice: SourceOption | undefined;
  if (input.prefer?.type === "warehouse") {
    choice = options.find((option) => option.type === "warehouse" && option.warehouse.id === (input.prefer as { warehouseId: string }).warehouseId && option.enough);
    if (!choice) throw new HttpError(400, "That warehouse does not have enough of this part", "sourceNotAvailable");
  } else if (input.prefer?.type === "supplier") {
    choice = options.find((option) => option.type === "supplier");
  }
  choice = choice ?? options.find((option) => option.recommended) ?? options[options.length - 1];

  const actor = input.actor ?? SYSTEM;
  if (choice?.type === "warehouse") {
    const transfer = await createTransfer({
      sparePartId: input.sparePartId,
      quantity: input.quantity,
      fromWarehouseId: choice.warehouse.id,
      toWarehouseId: home,
      serviceRequestId: job.id,
      note: input.note ?? `For ${job.displayId}`,
      actor,
    });
    return { kind: "transfer" as const, transfer, source: choice };
  }
  const order = await createPartOrder({
    sparePartId: input.sparePartId,
    quantity: input.quantity,
    serviceRequestId: job.id,
    warehouseId: home,
    note: input.note ?? null,
    createdById: ["admin", "receptionist", "technician", "warehouse"].includes(actor.role) ? actor.id : null,
  });
  return { kind: "order" as const, order, source: choice };
}
