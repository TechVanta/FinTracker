// =============================================================================
// Express Application — FinTracker API
// =============================================================================
// Main Express app that handles all API routes. Runs inside AWS Lambda
// via serverless-http, and also supports local development via local.js.
//
// Route structure:
//   /api/auth/*          — Authentication (signup, login)
//   /api/files/*         — File upload and processing
//   /api/transactions/*  — Transaction CRUD (list, create, update, delete)
//   /api/dashboard/*     — Spending analytics and insights
//   /api/categories/*    — Category management (admin)
//   /api/merchants/*     — Merchant mapping management (admin)
//   /api/health          — Health check
//
// On first request, the app auto-seeds the categories and merchant mappings
// tables if they're empty. This ensures a fresh deployment has all the
// Canadian merchant data ready to go without manual intervention.
// =============================================================================

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import fileRoutes from "./routes/files.js";
import transactionRoutes from "./routes/transactions.js";
import dashboardRoutes from "./routes/dashboard.js";
import categoryRoutes from "./routes/categories.js";
import merchantRoutes from "./routes/merchants.js";
import { seedCategories } from "./services/categoryService.js";
import { seedMerchantMappings } from "./services/merchantService.js";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for base64 image payloads

// ── Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/merchants", merchantRoutes);

// ── Health Check ─────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    version: "0.2.0",
    runtime: "nodejs",
    region: process.env.AWS_REGION || "unknown",
  });
});

// ── Auto-Seed on First Deploy ────────────────────────────────────────────
// Seeds the categories and merchant mappings tables on first request if
// they are empty. Uses a simple flag to ensure it only runs once per
// Lambda cold start (not on every request).
//
// This is safe to run multiple times — both seed functions check if the
// table already has data before inserting.
let seeded = false;

app.use(async (req, res, next) => {
  if (!seeded) {
    seeded = true; // Set flag immediately to prevent concurrent seed attempts
    try {
      await Promise.all([
        seedCategories(),
        seedMerchantMappings(),
      ]);
    } catch (err) {
      // Seed failure is non-fatal — the app works without seed data,
      // admin can manually seed later via /api/categories/seed
      console.warn("Auto-seed warning:", err.message);
    }
  }
  next();
});

export default app;
