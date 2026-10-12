import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { homeWarehouseId } from "./warehouses.js";

export type StaffScope = { id: string; name: string; role: string; warehouseId: string | null; serviceCenterId: string | null };

export async function staffScope(staff: { sub: string }): Promise<StaffScope> {
  const row = await prisma.staffUser.findUnique({ where: { id: staff.sub }, select: { id: true, name: true, role: true, warehouseId: true, serviceCenterId: true } });
  if (!row) throw new HttpError(401, "Account no longer exists");
  return row;
}

/** Admins run every warehouse; a keeper runs the warehouse assigned to them (or all of them when none is assigned). */
export function canManage(scope: StaffScope, warehouseId: string) {
  if (scope.role === "admin") return true;
  if (scope.role === "warehouse") return !scope.warehouseId || scope.warehouseId === warehouseId;
  return false;
}

export function requireManage(scope: StaffScope, warehouseId: string) {
  if (!canManage(scope, warehouseId)) throw new HttpError(403, "You do not look after this warehouse", "notYourWarehouse");
}

/** May this person confirm goods arriving at `warehouseId`? Managers, and the front desk of the centre it serves. */
export async function canReceiveAt(scope: StaffScope, warehouseId: string) {
  if (canManage(scope, warehouseId)) return true;
  if (scope.role === "receptionist") return (await homeWarehouseId(prisma, { staffId: scope.id })) === warehouseId;
  return false;
}
