import type { Server } from "socket.io";

let io: Server | null = null;

export function bindIo(server: Server) {
  io = server;
}

export function emitToStaff(event: string, payload: unknown) {
  io?.to("staff").emit(event, payload);
}

export function emitToCustomer(customerId: string, event: string, payload: unknown) {
  if (!customerId) return;
  io?.to(`customer:${customerId}`).emit(event, payload);
}

export function publishRequest(
  event: "request:created" | "request:updated",
  payload: { id: string; customerId: string },
) {
  emitToStaff(event, payload);
  emitToCustomer(payload.customerId, event, { id: payload.id, customerId: payload.customerId });
}
