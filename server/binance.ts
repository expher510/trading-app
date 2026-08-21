export interface BinanceDepositRecord {
  amount: number;
  coin: string;
  network: string;
  status: number; // 1 = Success / Confirmed on Blockchain
  address: string;
  txId: string;
  insertTime: number;
}

export interface VerificationResult {
  isValid: boolean;
  type: "completed" | "pending" | "wrong_coin" | "not_found" | "error";
  reason: string;
  matchedRecord?: BinanceDepositRecord;
}

const N8N_BINANCE_PROXY_URL = process.env.N8N_BINANCE_PROXY_URL || "";
const N8N_PROXY_API_KEY = process.env.N8N_PROXY_API_KEY || "";

/**
 * Fetches deposits from the Binance Proxy (n8n on VPS) and verifies the user's TXID
 */
export async function verifyBinanceDeposit(txidInput: string): Promise<VerificationResult> {
  const cleanTxid = txidInput.trim().toLowerCase();

  try {
    // 1. Call n8n proxy (which authenticates with Binance SAPI)
    const res = await fetch(N8N_BINANCE_PROXY_URL, {
      method: "GET",
      headers: {
        "x-api-key": N8N_PROXY_API_KEY,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Binance Proxy error response:", errText);
      return {
        isValid: false,
        type: "error",
        reason: `تعذر جلب سجلات بينانس عبر البروكسي (HTTP ${res.status}). تأكد من تفعيل الـ Workflow في n8n.`,
      };
    }

    const rawData = await res.json();

    // Support either direct array or wrapped object { body: [...] }
    let deposits: any[] = [];
    if (Array.isArray(rawData)) {
      deposits = rawData;
    } else if (Array.isArray(rawData?.body)) {
      deposits = rawData.body;
    } else if (Array.isArray(rawData?.data)) {
      deposits = rawData.data;
    } else if (rawData && typeof rawData === "object") {
      // If single record or custom wrapper
      deposits = [rawData];
    }

    console.log(`📡 Fetched ${deposits.length} deposits from Binance Proxy.`);

    // 2. Find matching TXID
    const found = deposits.find((d) => {
      const tx = (d.txId || d.txid || d.id || "").toString().trim().toLowerCase();
      return cleanTxid.length > 0 && tx === cleanTxid;
    });

    if (!found) {
      return {
        isValid: false,
        type: "not_found",
        reason: "لم نتمكن من العثور على معاملة بهذا الـ TXID في حساب بينانس. يرجى التأكد من إتمام التحويل ونسخ الـ TXID بشكل صحيح.",
      };
    }

    const matchedRecord: BinanceDepositRecord = {
      amount: parseFloat(found.amount || "0"),
      coin: (found.coin || "").toUpperCase(),
      network: found.network || "TRX",
      status: parseInt(found.status, 10),
      address: found.address || "",
      txId: found.txId || found.txid || cleanTxid,
      insertTime: Number(found.insertTime || Date.now()),
    };

    // 3. Status Validations
    if (matchedRecord.status !== 1) {
      return {
        isValid: false,
        type: "pending",
        reason: "المعاملة صحيحة ولكنها ما زالت قيد المعالجة (Pending) على شبكة البلوكشين. يرجى المحاولة بعد قليل ⏳.",
        matchedRecord,
      };
    }

    if (matchedRecord.coin !== "USDT") {
      return {
        isValid: false,
        type: "wrong_coin",
        reason: `العملة المحولة هي ${matchedRecord.coin}، والمطلوب هو USDT فقط 🔴.`,
        matchedRecord,
      };
    }

    return {
      isValid: true,
      type: "completed",
      reason: `تم التحقق بنجاح! تم استقبال ${matchedRecord.amount} USDT ✅`,
      matchedRecord,
    };
  } catch (error: any) {
    console.error("verifyBinanceDeposit exception:", error);
    return {
      isValid: false,
      type: "error",
      reason: "حدث خطأ أثناء الاتصال: " + (error?.message || "Internal Error"),
    };
  }
}
