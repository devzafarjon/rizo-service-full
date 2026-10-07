import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { env } from "../config.js";
import { prisma } from "./prisma.js";
import { pushBody } from "./pushText.js";

type Params = Record<string, unknown> | null | undefined;

export type PushInput = {
  message: string;
  code?: string | null;
  params?: Params;
  serviceRequestId?: string | null;
  notificationId?: string | null;
};

const TITLE = "RIZO Service";
let messaging: Messaging | null | undefined;
let warned = false;

function loadCredentials(): Record<string, unknown> | null {
  try {
    if (env.firebaseServiceAccount) return JSON.parse(env.firebaseServiceAccount) as Record<string, unknown>;
    if (env.firebaseServiceAccountFile) return JSON.parse(readFileSync(env.firebaseServiceAccountFile, "utf8")) as Record<string, unknown>;
  } catch (error) {
    console.error("[push] cannot read the Firebase service account:", error instanceof Error ? error.message : error);
  }
  return null;
}

function getFirebaseMessaging(): Messaging | null {
  if (messaging !== undefined) return messaging;
  const credentials = loadCredentials();
  if (!credentials) {
    messaging = null;
    return null;
  }
  const app: App = getApps()[0] ?? initializeApp({ credential: cert(credentials as Parameters<typeof cert>[0]) });
  messaging = getMessaging(app);
  return messaging;
}

export function pushConfigured() {
  return getFirebaseMessaging() !== null;
}

// Tokens Firebase says are gone (app uninstalled, token rotated) are dropped so we stop sending to them.
const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

async function deliver(tokens: Array<{ token: string; locale: string }>, input: PushInput) {
  if (tokens.length === 0) return;
  const fcm = getFirebaseMessaging();
  if (!fcm) {
    if (!warned) {
      warned = true;
      console.log("[push:console] Firebase is not configured; pushes are only logged (set FIREBASE_SERVICE_ACCOUNT).");
    }
    for (const { locale } of tokens) {
      console.log(`[push:console] ${TITLE}: ${pushBody({ ...input, locale })}`);
    }
    return;
  }
  const data: Record<string, string> = {
    code: input.code ?? "",
    serviceRequestId: input.serviceRequestId ?? "",
    notificationId: input.notificationId ?? "",
  };
  const response = await fcm.sendEach(
    tokens.map(({ token, locale }) => ({
      token,
      notification: { title: TITLE, body: pushBody({ ...input, locale }) },
      data,
      android: { priority: "high" as const, notification: { channelId: "rizo_default" } },
      apns: { payload: { aps: { sound: "default" } } },
    })),
  );
  const dead: string[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success && result.error && DEAD_TOKEN_CODES.has(result.error.code)) dead.push(tokens[index].token);
    else if (!result.success) console.error("[push] send failed:", result.error?.code);
  });
  if (dead.length) await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
}

/** Every notification the user has in the bell also becomes a push on each device they are signed in on. Never throws. */
export function pushToStaff(staffUserId: string, input: PushInput) {
  return prisma.deviceToken
    .findMany({ where: { staffUserId }, select: { token: true, locale: true } })
    .then((tokens) => deliver(tokens, input))
    .catch((error) => console.error("[push] staff push failed:", error instanceof Error ? error.message : error));
}

export function pushToCustomer(customerId: string, input: PushInput) {
  return prisma.deviceToken
    .findMany({ where: { customerId }, select: { token: true, locale: true } })
    .then((tokens) => deliver(tokens, input))
    .catch((error) => console.error("[push] customer push failed:", error instanceof Error ? error.message : error));
}

/** The technician's phone buzzes when a job lands on them. Push only: there is no in-app notification for it. */
export function pushJobAssigned(technicianId: string | null | undefined, request: { id: string; displayId: string }) {
  if (!technicianId) return;
  void pushToStaff(technicianId, {
    message: `A new job was assigned to you: #${request.displayId}`,
    code: "jobAssigned",
    params: { displayId: request.displayId },
    serviceRequestId: request.id,
  });
}
