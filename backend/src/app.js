import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import fileRoutes from "./routes/files.js";
import transactionRoutes from "./routes/transactions.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    version: "0.1.0",
    runtime: "nodejs",
    region: process.env.AWS_REGION || "unknown",
  });
});

export default app;
