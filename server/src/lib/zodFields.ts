import { z } from "zod";
import { HttpError } from "./httpError.js";
import { parseDateOnly } from "./warranty.js";

export const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export function dateField(message = "A valid date is required") {
  return z.string().min(1, message).transform((value) => {
    try {
      return parseDateOnly(value);
    } catch {
      throw new HttpError(400, message);
    }
  });
}
