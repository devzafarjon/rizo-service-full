import { Prisma } from "@prisma/client";
import { HttpError } from "./httpError.js";

export function handlePrismaError(error: unknown, labels?: Record<string, string>): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta?.target as string[]) : [];
      for (const [field, message] of Object.entries(labels ?? {})) {
        if (target.some((item) => item.includes(field))) {
          throw new HttpError(409, message, field === "sku" ? "skuExists" : field === "phone" ? "phoneExists" : "conflict");
        }
      }
      throw new HttpError(409, "A record with these details already exists", "conflict");
    }
    if (error.code === "P2025") {
      throw new HttpError(404, "Record not found", "notFound");
    }
  }
  throw error;
}
