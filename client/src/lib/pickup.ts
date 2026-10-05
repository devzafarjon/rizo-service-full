import type { LocationType } from "./types";

export function canConfirmPickup(request: {
  status: string;
  pickupConfirmedAt: string | null;
  locationType: LocationType;
}) {
  if (request.pickupConfirmedAt) return false;
  if (request.locationType !== "in_shop") return false;
  return request.status === "ready" || request.status === "completed";
}
