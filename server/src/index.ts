import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { runDatabaseBackup } from "./lib/backup.js";
import { tashkentCalendarDate } from "./lib/displayId.js";
import { verifyToken } from "./lib/jwt.js";
import { bindIo } from "./lib/realtime.js";
import { syncOverdueRequests } from "./lib/sla.js";

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: env.clientOrigin, credentials: true },
});
bindIo(io);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Sign in required"));
      return;
    }
    socket.data.auth = verifyToken(token);
    next();
  } catch {
    next(new Error("Invalid or expired session"));
  }
});

io.on("connection", (socket) => {
  if (socket.data.auth?.scope === "staff") {
    socket.join("staff");
  }
  if (socket.data.auth?.scope === "customer" && socket.data.auth.sub) {
    socket.join(`customer:${socket.data.auth.sub}`);
  }
});

function startOpsJobs() {
  const runSla = () => {
    void syncOverdueRequests().catch((error) => {
      console.error("[sla]", error);
    });
  };
  runSla();
  setInterval(runSla, 60_000);

  if (!env.backupEnabled) return;
  let lastBackupDay = "";
  const tickBackup = () => {
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(now),
    );
    const day = tashkentCalendarDate(now);
    if (hour !== 2 || lastBackupDay === day) return;
    lastBackupDay = day;
    void runDatabaseBackup()
      .then((file) => console.log(`[backup] wrote ${file}`))
      .catch((error) => console.error("[backup]", error));
  };
  tickBackup();
  setInterval(tickBackup, 60 * 60 * 1000);
}

server.listen(env.port, () => {
  console.log(`RIZO Service API listening on http://localhost:${env.port}`);
  startOpsJobs();
});
