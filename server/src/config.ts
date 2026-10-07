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

const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  port: Number(process.env.PORT ?? 4000),
  // The website address first (it is used in SMS links); more origins may follow, comma separated (for example a test build of the apps).
  clientOrigin: clientOrigins[0],
  corsOrigins: clientOrigins,
  smsProvider: process.env.SMS_PROVIDER ?? "console",
  smsHttpUrl: process.env.SMS_HTTP_URL ?? "",
  smsHttpToken: process.env.SMS_HTTP_TOKEN ?? "",
  telegramProvider: process.env.TELEGRAM_PROVIDER ?? "console",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",
  // Online payment pages (links only; the office records the payment). Leave empty to hide the buttons.
  paymeMerchantId: process.env.PAYME_MERCHANT_ID ?? "",
  clickServiceId: process.env.CLICK_SERVICE_ID ?? "",
  clickMerchantId: process.env.CLICK_MERCHANT_ID ?? "",
  // Key the RIZO market sends in X-Api-Key when it posts a sale.
  marketApiKey: process.env.MARKET_API_KEY ?? "",
  // Push notifications (Firebase Cloud Messaging). Paste the service-account JSON into FIREBASE_SERVICE_ACCOUNT on the host,
  // or point FIREBASE_SERVICE_ACCOUNT_FILE at the file when developing. Without either, pushes are only logged.
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? "",
  firebaseServiceAccountFile: process.env.FIREBASE_SERVICE_ACCOUNT_FILE ?? "",
  backupDir: process.env.BACKUP_DIR ?? "",
  backupRetainDays: Number(process.env.BACKUP_RETAIN_DAYS ?? 30),
  backupEnabled: process.env.BACKUP_ENABLED === "true",
};
