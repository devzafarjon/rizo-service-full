import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "./httpError.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.resolve(here, "../../uploads");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

export function ensureUploadsRoot() {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

export function savePickupSignature(requestId: string, dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) {
    throw new HttpError(400, "Signature image is invalid", "invalidSignature");
  }
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const dir = path.join(uploadsRoot, "pickup", requestId);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `sign-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(match[2], "base64"));
  return `/api/uploads/pickup/${requestId}/${filename}`;
}

export function publicPhotoUrl(requestId: string, filename: string) {
  return `/api/uploads/jobs/${requestId}/${filename}`;
}

export function removeUploadedFile(photoUrl: string) {
  const prefix = photoUrl.startsWith("/api/uploads/")
    ? "/api/uploads/"
    : photoUrl.startsWith("/uploads/")
      ? "/uploads/"
      : null;
  if (!prefix) return;
  const relative = photoUrl.slice(prefix.length);
  const absolute = path.resolve(uploadsRoot, relative);
  if (!absolute.startsWith(uploadsRoot)) return;
  fs.unlink(absolute, () => undefined);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadsRoot, "jobs", String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = IMAGE_EXT.has(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith("image/") || IMAGE_EXT.has(ext)) {
      cb(null, true);
      return;
    }
    cb(new HttpError(400, "Photos must be image files"));
  },
});

export function acceptJobPhotos(req: Request, res: Response, next: NextFunction) {
  upload.array("photos", 8)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(400, "Each photo must be 8 MB or smaller"));
        return;
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        next(new HttpError(400, "You can upload up to 8 photos at once"));
        return;
      }
      next(new HttpError(400, err.message));
      return;
    }
    next(err instanceof HttpError ? err : new HttpError(400, err instanceof Error ? err.message : "Could not upload photos"));
  });
}
