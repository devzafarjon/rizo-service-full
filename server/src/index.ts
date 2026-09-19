import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config.js";
import { verifyToken } from "./lib/jwt.js";
import { bindIo } from "./lib/realtime.js";

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

server.listen(env.port, () => {
  console.log(`RIZO Service API listening on http://localhost:${env.port}`);
});
