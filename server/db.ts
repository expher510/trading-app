import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "trading_app.db");
export const db = new Database(dbPath);

// Enable WAL mode for high performance
db.pragma("journal_mode = WAL");

// Initialize Database Schema
export function initDatabase() {
  db.exec(`
    -- 1. Users & Wallets Table (Supports both Telegram & Web Email Auth)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id INTEGER UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      username TEXT,
      first_name TEXT,
      balance REAL DEFAULT 0.00,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Deposits Table with UNIQUE txid constraint (Guarantees Anti-Double-Spend)
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      telegram_id INTEGER,
      txid TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      coin TEXT DEFAULT 'USDT',
      network TEXT DEFAULT 'TRX',
      status TEXT DEFAULT 'COMPLETED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- 3. Trades Table
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      size REAL NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      stop_loss REAL,
      take_profit REAL,
      pnl REAL,
      status TEXT DEFAULT 'OPEN',
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_deposits_txid ON deposits(txid);
    CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);

    -- 4. Refund / Withdrawal Requests Table
    CREATE TABLE IF NOT EXISTS refund_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      wallet_address TEXT NOT NULL,
      network TEXT DEFAULT 'TRX',
      reason TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- 5. Account Link Codes Table (Telegram to Web Linking)
    CREATE TABLE IF NOT EXISTS link_codes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      telegram_id INTEGER,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    -- 6. Admin Audit Logs Table (Security & Accountability)
    CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      target_user_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_link_codes_code ON link_codes(code);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at);
  `);

  // Safe table alterations if table existed prior
  try {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT;");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);");
  } catch {}

  console.log("✅ Internal SQLite Database & Tables Initialized Successfully at:", dbPath);
}

// Password hashing helper
export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password.trim()).digest("hex");
}

// Telegram User Auth Helper (Starting Balance = 0.00)
export function getOrCreateTelegramUser(telegramId: number, firstName?: string, username?: string) {
  const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as any;
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, telegram_id, first_name, username, balance)
    VALUES (?, ?, ?, ?, 0.00)
  `).run(id, telegramId, firstName || "Trader", username || "");

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
}

// Email/Password Registration Helper (Starting Balance = 0.00)
export function registerEmailUser(email: string, passwordPlain: string, firstName?: string) {
  const cleanEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
  if (existing) {
    throw new Error("البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.");
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(passwordPlain);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, balance)
    VALUES (?, ?, ?, ?, 0.00)
  `).run(id, cleanEmail, passwordHash, firstName || "Trader");

  return db.prepare("SELECT id, email, first_name, balance, telegram_id, created_at FROM users WHERE id = ?").get(id) as any;
}

// Email/Password Login Helper
export function loginEmailUser(email: string, passwordPlain: string) {
  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(cleanEmail) as any;
  if (!user) {
    throw new Error("البريد الإلكتروني غير مسجل.");
  }

  const passwordHash = hashPassword(passwordPlain);
  if (user.password_hash !== passwordHash) {
    throw new Error("كلمة المرور غير صحيحة.");
  }

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    balance: user.balance,
    telegram_id: user.telegram_id,
    created_at: user.created_at,
  };
}

// Link Telegram ID to an existing Web Email Account
export function linkTelegramToAccount(userId: string, telegramId: number) {
  db.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").run(telegramId, userId);
  return db.prepare("SELECT id, email, first_name, balance, telegram_id FROM users WHERE id = ?").get(userId) as any;
}

export function getUserById(userId: string) {
  return db.prepare("SELECT id, email, first_name, username, balance, telegram_id, created_at FROM users WHERE id = ?").get(userId) as any;
}

export function isTxidUsed(txid: string): boolean {
  const row = db.prepare("SELECT id FROM deposits WHERE LOWER(txid) = LOWER(?)").get(txid.trim());
  return !!row;
}

export function recordDepositAndUpdateBalance(params: {
  userId: string;
  telegramId?: number;
  txid: string;
  amount: number;
  coin?: string;
  network?: string;
}) {
  const depositTx = db.transaction(() => {
    // 1. Insert deposit record (fails if txid is already used due to UNIQUE constraint)
    const depositId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO deposits (id, user_id, telegram_id, txid, amount, coin, network, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
    `).run(
      depositId,
      params.userId,
      params.telegramId || null,
      params.txid.trim().toLowerCase(),
      params.amount,
      params.coin || "USDT",
      params.network || "TRX"
    );

    // 2. Update user balance
    db.prepare(`
      UPDATE users
      SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(params.amount, params.userId);

    const updatedUser = db.prepare("SELECT id, email, first_name, balance, telegram_id FROM users WHERE id = ?").get(params.userId) as any;
    return { depositId, updatedUser };
  });

  return depositTx();
}

export function getUserDeposits(userId: string) {
  return db
    .prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as any[];
}

export function createRefundRequest(params: {
  userId: string;
  amount: number;
  walletAddress: string;
  network?: string;
  reason?: string;
}) {
  const refundId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO refund_requests (id, user_id, amount, wallet_address, network, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
  `).run(
    refundId,
    params.userId,
    params.amount,
    params.walletAddress.trim(),
    params.network || "TRX",
    params.reason || "طلب استرداد رصيد من لوحة التحكم"
  );
  return db.prepare("SELECT * FROM refund_requests WHERE id = ?").get(refundId) as any;
}

// ── 6-Digit Link Code Generation (for Telegram-to-Web linking) ──
export function createLinkCode(userId: string, telegramId?: number) {
  // Generate random 6-digit code (e.g. 748291)
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = crypto.randomUUID();
  // Valid for 15 minutes
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Invalidate any old unused codes for this user
  db.prepare("UPDATE link_codes SET used = 1 WHERE user_id = ? AND used = 0").run(userId);

  db.prepare(`
    INSERT INTO link_codes (id, code, user_id, telegram_id, expires_at, used)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, code, userId, telegramId || null, expiresAt);

  return { code, expiresAt };
}

// ── 6-Digit Link Code Redemption ──
export function redeemLinkCode(code: string, currentWebUserId?: string) {
  const cleanCode = code.trim().replace(/\s|-/g, "");
  const linkRow = db.prepare(`
    SELECT * FROM link_codes
    WHERE code = ? AND used = 0 AND expires_at > datetime('now')
  `).get(cleanCode) as any;

  if (!linkRow) {
    throw new Error("كود الربط غير صحيح أو انتهت صلاحيته (صلاحية الكود 15 دقيقة).");
  }

  // Mark code as used immediately
  db.prepare("UPDATE link_codes SET used = 1 WHERE id = ?").run(linkRow.id);

  // If current Web user is already logged in with email, link Telegram ID to that account
  if (currentWebUserId && currentWebUserId !== linkRow.user_id) {
    const webUser = getUserById(currentWebUserId);
    const tgUser = getUserById(linkRow.user_id);
    if (webUser && tgUser) {
      // Merge balances and transfer Telegram ID to web account
      const newBalance = webUser.balance + tgUser.balance;
      db.prepare(`
        UPDATE users
        SET balance = ?, telegram_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newBalance, tgUser.telegram_id, currentWebUserId);

      // Reassign deposits to merged account
      db.prepare("UPDATE deposits SET user_id = ? WHERE user_id = ?").run(currentWebUserId, tgUser.id);
      return getUserById(currentWebUserId);
    }
  }

  // Return the authenticated Telegram user profile
  return getUserById(linkRow.user_id);
}

// ── Admin Management Functions ──

export function getAdminStats() {
  const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count || 0;
  const totalUserBalance = (db.prepare("SELECT SUM(balance) as total FROM users").get() as any)?.total || 0;
  const pendingRefunds = (db.prepare("SELECT COUNT(*) as count, SUM(amount) as sum FROM refund_requests WHERE status = 'PENDING'").get() as any) || { count: 0, sum: 0 };
  const totalDeposits = (db.prepare("SELECT COUNT(*) as count, SUM(amount) as sum FROM deposits WHERE status = 'COMPLETED'").get() as any) || { count: 0, sum: 0 };

  return {
    userCount,
    totalUserBalance: Number(totalUserBalance.toFixed(2)),
    pendingRefundCount: pendingRefunds.count || 0,
    pendingRefundSum: Number((pendingRefunds.sum || 0).toFixed(2)),
    totalDepositCount: totalDeposits.count || 0,
    totalDepositSum: Number((totalDeposits.sum || 0).toFixed(2)),
  };
}

export function getAllWithdrawals() {
  return db.prepare(`
    SELECT r.*, u.email, u.first_name, u.telegram_id, u.balance as current_user_balance
    FROM refund_requests r
    LEFT JOIN users u ON r.user_id = u.id
    ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC
  `).all() as any[];
}

export function approveWithdrawal(requestId: string, adminNote?: string) {
  const tx = db.transaction(() => {
    const req = db.prepare("SELECT * FROM refund_requests WHERE id = ?").get(requestId) as any;
    if (!req) throw new Error("طلب السحب غير موجود.");
    if (req.status !== "PENDING") throw new Error("هذا الطلب تمت معالجته مسبقاً.");

    // Update request status to APPROVED
    db.prepare(`
      UPDATE refund_requests
      SET status = 'APPROVED', reason = COALESCE(?, reason)
      WHERE id = ?
    `).run(adminNote || "تم اعتماد السحب والتحويل", requestId);

    // Deduct amount from user balance
    db.prepare(`
      UPDATE users
      SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.amount, req.user_id);

    // Log admin action
    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO admin_logs (id, action, target_user_id, details)
      VALUES (?, 'APPROVE_WITHDRAWAL', ?, ?)
    `).run(logId, req.user_id, `تمت الموافقة على سحب مبلغ ${req.amount} USDT للمحفظة ${req.wallet_address}`);

    return { success: true, amount: req.amount, userId: req.user_id };
  });

  return tx();
}

export function rejectWithdrawal(requestId: string, rejectReason: string) {
  const tx = db.transaction(() => {
    const req = db.prepare("SELECT * FROM refund_requests WHERE id = ?").get(requestId) as any;
    if (!req) throw new Error("طلب السحب غير موجود.");
    if (req.status !== "PENDING") throw new Error("هذا الطلب تمت معالجته مسبقاً.");

    db.prepare(`
      UPDATE refund_requests
      SET status = 'REJECTED', reason = ?
      WHERE id = ?
    `).run(rejectReason || "تم رفض طلب السحب من الإدارة", requestId);

    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO admin_logs (id, action, target_user_id, details)
      VALUES (?, 'REJECT_WITHDRAWAL', ?, ?)
    `).run(logId, req.user_id, `تم رفض سحب مبلغ ${req.amount} USDT. السبب: ${rejectReason}`);

    return { success: true, requestId };
  });

  return tx();
}

export function getAllAdminUsers(search?: string) {
  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    return db.prepare(`
      SELECT u.id, u.email, u.first_name, u.telegram_id, u.balance, u.created_at,
             (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) as deposit_count,
             (SELECT SUM(amount) FROM deposits d WHERE d.user_id = u.id AND d.status = 'COMPLETED') as total_deposited
      FROM users u
      WHERE LOWER(COALESCE(u.email, '')) LIKE ?
         OR LOWER(COALESCE(u.first_name, '')) LIKE ?
         OR CAST(COALESCE(u.telegram_id, '') AS TEXT) LIKE ?
         OR LOWER(u.id) LIKE ?
      ORDER BY u.created_at DESC
    `).all(term, term, term, term) as any[];
  }

  return db.prepare(`
    SELECT u.id, u.email, u.first_name, u.telegram_id, u.balance, u.created_at,
           (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) as deposit_count,
           (SELECT SUM(amount) FROM deposits d WHERE d.user_id = u.id AND d.status = 'COMPLETED') as total_deposited
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 200
  `).all() as any[];
}

export function adjustUserBalance(userId: string, deltaAmount: number, reason: string) {
  const tx = db.transaction(() => {
    const user = getUserById(userId);
    if (!user) throw new Error("المستخدم غير موجود.");

    const newBalance = Math.max(0, user.balance + deltaAmount);
    db.prepare(`
      UPDATE users
      SET balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newBalance, userId);

    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO admin_logs (id, action, target_user_id, details)
      VALUES (?, 'ADJUST_BALANCE', ?, ?)
    `).run(
      logId,
      userId,
      `تعديل رصيد: ${deltaAmount >= 0 ? "+" : ""}${deltaAmount} USDT. الرصيد القديم: ${user.balance} -> الجديد: ${newBalance}. السبب: ${reason}`
    );

    return getUserById(userId);
  });

  return tx();
}

export function getAdminLogs(limit = 100) {
  return db.prepare(`
    SELECT l.*, u.email, u.first_name, u.telegram_id
    FROM admin_logs l
    LEFT JOIN users u ON l.target_user_id = u.id
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(limit) as any[];
}
