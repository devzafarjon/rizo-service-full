import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config.js";

// Photos and signatures are written to disk first and copied to an S3-compatible bucket (Cloudflare R2, …) when one is
// configured. The disk of a free host is wiped on every deploy, so a file missing on disk is read back from the bucket.
// Keys are the path under the uploads folder ("jobs/<request id>/<file>"), so the stored /api/uploads/... URLs never change.

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".svg": "image/svg+xml",
};

export const bucketEnabled = Boolean(env.bucketName && env.bucketAccessKeyId && env.bucketSecretAccessKey && env.bucketEndpoint);

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({
    region: "auto",
    forcePathStyle: true,
    endpoint: env.bucketEndpoint,
    credentials: { accessKeyId: env.bucketAccessKeyId, secretAccessKey: env.bucketSecretAccessKey },
  });
  return client;
}

/** Copies a file that is already on disk into the bucket. No-op without a bucket. */
export async function mirrorToBucket(key: string, absolutePath: string) {
  if (!bucketEnabled) return;
  await s3().send(
    new PutObjectCommand({
      Bucket: env.bucketName,
      Key: key,
      Body: fs.readFileSync(absolutePath),
      ContentType: MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream",
    }),
  );
}

export async function removeFromBucket(key: string) {
  if (!bucketEnabled) return;
  await s3().send(new DeleteObjectCommand({ Bucket: env.bucketName, Key: key }));
}

/** Streams an object from the bucket, or returns null when there is none (or no bucket). */
export async function readFromBucket(key: string): Promise<{ body: Readable; contentType: string } | null> {
  if (!bucketEnabled) return null;
  try {
    const out = await s3().send(new GetObjectCommand({ Bucket: env.bucketName, Key: key }));
    if (!out.Body) return null;
    return { body: out.Body as Readable, contentType: out.ContentType ?? MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream" };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}
