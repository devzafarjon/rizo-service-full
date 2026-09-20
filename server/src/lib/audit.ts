import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type AuditActor = {
  id: string;
  type: "staff" | "customer" | "system";
  name?: string | null;
};

export async function writeAudit(input: {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      userType: input.actor.type,
      userName: input.actor.name ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
    },
  });
}

export function staffActor(staff?: { sub: string; name: string } | null): AuditActor {
  if (!staff) return { id: "system", type: "system", name: "system" };
  return { id: staff.sub, type: "staff", name: staff.name };
}

export function customerActor(customer?: { sub: string; name: string } | null): AuditActor {
  if (!customer) return { id: "system", type: "system", name: "system" };
  return { id: customer.sub, type: "customer", name: customer.name };
}
