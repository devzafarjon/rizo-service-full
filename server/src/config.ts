import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  smsHttpUrl: process.env.SMS_HTTP_URL ?? "",
  smsHttpToken: process.env.SMS_HTTP_TOKEN ?? "",
  telegramProvider: process.env.TELEGRAM_PROVIDER ?? "console",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",
  backupDir: process.env.BACKUP_DIR ?? "",
  backupRetainDays: Number(process.env.BACKUP_RETAIN_DAYS ?? 30),
  backupEnabled: process.env.BACKUP_ENABLED === "true",
};
