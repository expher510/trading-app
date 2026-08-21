import { Router } from "express";
import { isTxidUsed, recordDepositAndUpdateBalance, getOrCreateTelegramUser, getUserById } from "../db.js";
import { verifyBinanceDeposit } from "../binance.js";

export const depositRouter = Router();

/**
 * GET /api/deposit/info
 * Returns the master deposit wallet address and supported networks
 */
depositRouter.get("/info", (req, res) => {
  res.json({
    wallet_address: process.env.DEPOSIT_WALLET_ADDRESS || "TCsuCvfmCtqsCxGW9H3wXbuCUUV4u8AhNC",
    coin: "USDT",
    network: "TRC20 / BEP20",
    min_deposit: 10.0,
  });
});

/**
 * POST /api/deposit/verify
 * The single endpoint that verifies a TXID, validates on Binance SAPI,
 * checks anti-double-spend, and credits the user's balance.
 */
depositRouter.post("/verify", async (req, res) => {
  try {
    const { txid, user_id, telegram_id, first_name, username } = req.body;

    if (!txid || typeof txid !== "string" || txid.trim().length < 5) {
      return res.status(400).json({
        status: "error",
        message: "يرجى إدخال رقم معاملة (TXID) صحيح.",
      });
    }

    const cleanTxid = txid.trim();

    // 1. Check Anti-Double-Spend in Local Database
    if (isTxidUsed(cleanTxid)) {
      return res.status(400).json({
        status: "error",
        message: "عفواً، رقم المعاملة هذا (TXID) تم استخدامه وشحن الرصيد به من قبل ❌.",
      });
    }

    // 2. Fetch or Create User in Database
    let user = null;
    if (user_id) {
      user = getUserById(user_id);
    }
    if (!user) {
      const telegramId = Number(telegram_id) || 5108366071;
      user = getOrCreateTelegramUser(telegramId, first_name, username);
    }

    // 3. Verify on Binance (via VPS Proxy)
    const verification = await verifyBinanceDeposit(cleanTxid);

    if (!verification.isValid || !verification.matchedRecord) {
      return res.status(400).json({
        status: "error",
        message: verification.reason,
      });
    }

    // 4. Record Deposit & Credit User Balance (Atomic Database Transaction)
    const { updatedUser } = recordDepositAndUpdateBalance({
      userId: user.id,
      telegramId: user.telegram_id || undefined,
      txid: cleanTxid,
      amount: verification.matchedRecord.amount,
      coin: verification.matchedRecord.coin,
      network: verification.matchedRecord.network,
    });

    return res.json({
      status: "success",
      message: `تم التحقق بنجاح! تم إضافة ${verification.matchedRecord.amount} USDT إلى رصيدك 🎉`,
      amount_credited: verification.matchedRecord.amount,
      new_balance: updatedUser.balance,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        telegram_id: updatedUser.telegram_id,
        balance: updatedUser.balance,
      },
    });
  } catch (err: any) {
    console.error("Deposit verification error:", err);
    return res.status(500).json({
      status: "error",
      message: "حدث خطأ غير متوقع في الخادم: " + (err?.message || "Internal Server Error"),
    });
  }
});
