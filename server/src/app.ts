import cors from "cors";
import express from "express";
import { env } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { catalogRouter } from "./routes/catalog.js";
import { customerAuthRouter } from "./routes/customerAuth.js";
import { customerPortalRouter } from "./routes/customerPortal.js";
import { customersRouter } from "./routes/customers.js";
import { healthRouter } from "./routes/health.js";
import { myJobsRouter } from "./routes/myJobs.js";
import { productsRouter } from "./routes/products.js";
import { reportsRouter } from "./routes/reports.js";
import { requestsRouter } from "./routes/requests.js";
import { salesRouter } from "./routes/sales.js";
import { searchRouter } from "./routes/search.js";
import { staffAuthRouter } from "./routes/staffAuth.js";
import { techniciansRouter } from "./routes/technicians.js";
import { ensureUploadsRoot, uploadsRoot } from "./lib/uploads.js";

export function createApp() {
  const app = express();
  ensureUploadsRoot();
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(uploadsRoot));
  app.use("/api/uploads", express.static(uploadsRoot));

  app.use("/api/health", healthRouter);
  app.use("/api/staff/auth", staffAuthRouter);
  app.use("/api/customer/auth", customerAuthRouter);
  app.use("/api/customer", customerPortalRouter);
  app.use("/api/staff/customers", customersRouter);
  app.use("/api/staff/products", productsRouter);
  app.use("/api/staff/catalog", catalogRouter);
  app.use("/api/staff/sales", salesRouter);
  app.use("/api/staff/search", searchRouter);
  app.use("/api/staff/technicians", techniciansRouter);
  app.use("/api/staff/requests", requestsRouter);
  app.use("/api/staff/reports", reportsRouter);
  app.use("/api/staff/my-jobs", myJobsRouter);

  app.use(errorHandler);
  return app;
}
