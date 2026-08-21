import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDatabase } from "./db.js";
import { depositRouter } from "./routes/deposit.js";
import { userRouter } from "./routes/user.js";
import { adminRouter } from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize SQLite Database
initDatabase();

// Mount Routes
app.use("/api/deposit", depositRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Trading MiniApp Internal Backend",
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Internal Backend Server running at http://localhost:${PORT}`);
  console.log(`📡 Single-Endpoint Deposit Verification available at: POST http://localhost:${PORT}/api/deposit/verify`);
});
