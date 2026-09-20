import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config.js";

const exec = promisify(execFile);

export function backupDir() {
  return env.backupDir || path.resolve(process.cwd(), "backups");
}

export async function runDatabaseBackup() {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `rizo-service-${stamp}.sql`);
  await exec("pg_dump", ["--no-owner", "--no-acl", "--dbname", env.databaseUrl, "--file", file]);
  await pruneBackups(dir, env.backupRetainDays);
  return file;
}

async function pruneBackups(dir: string, retainDays: number) {
  const cutoff = Date.now() - retainDays * 86400000;
  const entries = await fs.readdir(dir);
  for (const name of entries) {
    if (!name.startsWith("rizo-service-") || !name.endsWith(".sql")) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(full);
    }
  }
}
