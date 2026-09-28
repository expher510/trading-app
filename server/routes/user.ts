import { Router } from "express";
import {
  getOrCreateTelegramUser,
  getUserById,
  registerEmailUser,
  loginEmailUser,
  linkTelegramToAccount,
  getUserDeposits,
  createRefundRequest,
  createLinkCode,
  redeemLinkCode,
} from "../db.js";

export const userRouter = Router();

/**
 * POST /api/user/register
 * Web Email Registration (Starting Balance = $0.00)
 */
userRouter.post("/register", (req, res) => {
  try {
    const { email, password, firstName } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "يرجى إدخال بريد إلكتروني صالح وكلمة مرور لا تقل عن 6 أحرف.",
      });
    }

    const user = registerEmailUser(email, password, firstName);
    return res.json({ status: "success", user });
  } catch (err: any) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/login
 * Web Email Login
 */
userRouter.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "يرجى إدخال البريد الإلكتروني وكلمة المرور.",
      });
    }

    const user = loginEmailUser(email, password);
    return res.json({ status: "success", user });
  } catch (err: any) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/telegram-auth
 * Telegram Mini App Auto-Authentication (Starting Balance = $0.00)
 */
userRouter.post("/telegram-auth", (req, res) => {
  try {
    const { telegram_id, first_name, username } = req.body;
    const telegramId = Number(telegram_id);
    if (!telegramId) {
      return res.status(400).json({ status: "error", message: "Telegram ID is required." });
    }

    const user = getOrCreateTelegramUser(telegramId, first_name, username);
    return res.json({ status: "success", user });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/generate-link-code
 * Generates a 6-digit code inside Telegram Mini App to link to Web
 */
userRouter.post("/generate-link-code", (req, res) => {
  try {
    const { user_id, telegram_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ status: "error", message: "User ID is required." });
    }

    const linkData = createLinkCode(user_id, Number(telegram_id) || undefined);
    return res.json({
      status: "success",
      code: linkData.code,
      expires_at: linkData.expiresAt,
      message: "تم إنشاء كود الربط بنجاح (صالح لمدة 15 دقيقة)",
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/redeem-link-code
 * Redeems a 6-digit code on the Web to log in or link account
 */
userRouter.post("/redeem-link-code", (req, res) => {
  try {
    const { code, current_user_id } = req.body;
    if (!code || typeof code !== "string" || code.trim().length < 6) {
      return res.status(400).json({
        status: "error",
        message: "يرجى إدخال كود الربط المكون من 6 أرقام.",
      });
    }

    const user = redeemLinkCode(code, current_user_id);
    return res.json({
      status: "success",
      message: "تم ربط الحساب بنجاح! مرحباً بك.",
      user,
    });
  } catch (err: any) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/link-telegram
 * Links Telegram account to Web user
 */
userRouter.post("/link-telegram", (req, res) => {
  try {
    const { user_id, telegram_id } = req.body;
    if (!user_id || !telegram_id) {
      return res.status(400).json({ status: "error", message: "User ID and Telegram ID required." });
    }

    const updatedUser = linkTelegramToAccount(user_id, Number(telegram_id));
    return res.json({ status: "success", user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * GET /api/user/:userId
 * Retrieves user profile details and fresh balance
 */
userRouter.get("/:userId", (req, res) => {
  try {
    const user = getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "المستخدم غير موجود." });
    }
    return res.json({ status: "success", user });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * GET /api/user/:userId/deposits
 * Retrieves all deposit history records for the user
 */
userRouter.get("/:userId/deposits", (req, res) => {
  try {
    const deposits = getUserDeposits(req.params.userId);
    return res.json({ status: "success", deposits });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

/**
 * POST /api/user/refund-request
 * Submits a refund / withdrawal request for the user and immediately deducts balance
 */
userRouter.post("/refund-request", (req, res) => {
  try {
    const { user_id, amount, wallet_address, network, reason } = req.body;
    if (!user_id || !amount || !wallet_address) {
      return res.status(400).json({
        status: "error",
        message: "يرجى تحديد المبلغ وعنوان المحفظة المستلمة.",
      });
    }

    const { request, updatedUser } = createRefundRequest({
      userId: user_id,
      amount: Number(amount),
      walletAddress: String(wallet_address),
      network: network || "TRX",
      reason: reason || "طلب استرداد رصيد",
    });

    return res.json({
      status: "success",
      message: "تم تسجيل طلب السحب وخصم المبلغ من رصيدك بنجاح! سيتم مراجعته وتحويل المبلغ لمحفظتك.",
      request,
      user: updatedUser,
    });
  } catch (err: any) {
    return res.status(400).json({ status: "error", message: err.message });
  }
});
