import { HttpError } from "./httpError.js";

/** Digits only, exactly as typed — for partial matching in search boxes. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** Stored form of a phone number: digits only, and a 9-digit Uzbek local number gets the 998 country code. */
export function normalizePhone(input: string): string {
  const digits = digitsOnly(input);
  return digits.length === 9 ? `998${digits}` : digits;
}

export function assertPhone(phone: string) {
  if (phone.length < 9 || phone.length > 15) {
    throw new HttpError(400, "Enter a valid phone number");
  }
}
