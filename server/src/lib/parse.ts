import type { ZodType } from "zod";
import { HttpError } from "./httpError.js";

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid input", "invalidInput");
  }
  return result.data;
}
