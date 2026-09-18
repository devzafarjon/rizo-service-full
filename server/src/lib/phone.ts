import { HttpError } from "./httpError.js";

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function assertPhone(phone: string) {
  if (phone.length < 9 || phone.length > 15) {
    throw new HttpError(400, "Enter a valid phone number");
  }
}
