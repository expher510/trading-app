import { Router, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import {
  getAdminStats,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getAllAdminUsers,
  adjustUserBalance,
  getAdminLogs,
} from "../db.js";

export const adminRouter = Router();

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "AdminTrading2026!SecretKey#99";
}

function getAdminSecretKey(): string {
  return process.env.ADMIN_SECRET_KEY || "SuperAdminTokenSecretSignature2026!#$";
}

// In-memory brute-force rate limiter for admin login attempts (by IP)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function generateAdminToken(): string {
  const secret = getAdminSecretKey();
  const timestamp = Date.now();
  const raw = `${timestamp}:${secret}`;
  const signature = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return Buffer.from(`${timestamp}:${signature}`).toString("base64");
}

function verifyAdminToken(token: string): boolean {
  try {
    const secret = getAdminSecretKey();
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [timestampStr, signature] = decoded.split(":");
    const timestamp = parseInt(timestampStr, 10);
    if (!timestamp || isNaN(timestamp)) return false;

    // Token expires after 12 hours
    if (Date.now() - timestamp > 12 * 60 * 60 * 1000) return false;

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}:${secret}`)
      .digest("hex");

    return signature === expectedSig;
  } catch {
    return false;
  }
}

// Security Middleware to protect all admin endpoints
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-admin-token"] as string;
  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({
      error: "غير مصرح بالدخول (Unauthorized). جلسة الإدارة منتهية أو غير صحيحة.",
    });
  }
  next();
}

// ── 1. Admin Login with Brute-Force Shield ──
adminRouter.post("/login", (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
  const now = Date.now();

  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > now) {
    const waitMins = Math.ceil((attempt.lockedUntil - now) / 60000);
    return res.status(429).json({
      error: `تم حظر محاولات الدخول مؤقتاً لحماية اللوحة. يرجى المحاولة بعد ${waitMins} دقيقة.`,
    });
  }

  const { password } = req.body;
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "كلمة المرور مطلوبة." });
  }

  const expectedPassword = getAdminPassword();
  const isMatch = password === expectedPassword;

  if (!isMatch) {
    attempt.count += 1;
    if (attempt.count >= 5) {
      attempt.lockedUntil = now + 15 * 60 * 1000; // 15-minute lockout
    }
    loginAttempts.set(ip, attempt);
    return res.status(401).json({
      error: "كلمة مرور الإدارة غير صحيحة.",
      remainingAttempts: Math.max(0, 5 - attempt.count),
    });
  }

  // Reset attempts on successful authentication
  loginAttempts.delete(ip);
  const token = generateAdminToken();

  return res.json({
    success: true,
    token,
    message: "تم تسجيل الدخول كمسؤول بنجاح.",
  });
});

// ── 2. Admin Platform Overview Statistics ──
adminRouter.get("/stats", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const stats = getAdminStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── 3. Withdrawals Management ──
adminRouter.get("/withdrawals", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const withdrawals = getAllWithdrawals();
    res.json(withdrawals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post("/withdrawals/:id/approve", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const result = approveWithdrawal(id, note);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/withdrawals/:id/reject", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "يرجى كتابة سبب رفض السحب." });
    }
    const result = rejectWithdrawal(id, reason.trim());
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── 4. Users Management & Manual Balance Adjustments ──
adminRouter.get("/users", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    const users = getAllAdminUsers(search);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.post("/users/:id/adjust-balance", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const delta = parseFloat(amount);
    if (isNaN(delta) || delta === 0) {
      return res.status(400).json({ error: "المبلغ غير صحيح." });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "يرجى كتابة سبب تعديل الرصيد (مطلوب لتدقيق الحسابات)." });
    }

    const updatedUser = adjustUserBalance(id, delta, reason.trim());
    res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ── 5. Audit Logs ──
adminRouter.get("/logs", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const logs = getAdminLogs(100);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
