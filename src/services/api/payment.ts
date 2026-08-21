/**
 * Payment Service - Direct Single-Endpoint Deposit Verification
 */

export interface DepositInfoResponse {
  wallet_address: string;
  coin: string;
  network: string;
  min_deposit: number;
}

export interface VerifyDepositInput {
  txid: string;
  userId?: string;
  telegramId?: string;
  firstName?: string;
  username?: string;
}

export interface VerifyDepositResponse {
  status: "success" | "error";
  message: string;
  amount_credited?: number;
  new_balance?: number;
  user?: {
    id: string;
    telegram_id?: number;
    email?: string;
    balance: number;
  };
}

/**
 * Fetches the deposit wallet details
 */
export async function getDepositInfo(): Promise<DepositInfoResponse> {
  try {
    const res = await fetch("/api/deposit/info");
    if (!res.ok) throw new Error("Failed to fetch deposit info");
    return await res.json();
  } catch {
    return {
      wallet_address: "TCsuCvfmCtqsCxGW9H3wXbuCUUV4u8AhNC",
      coin: "USDT",
      network: "TRC20 / BEP20",
      min_deposit: 10.0,
    };
  }
}

/**
 * Single-Endpoint: Verifies TXID directly and auto-credits user balance
 */
export async function verifyDepositTxid(input: VerifyDepositInput): Promise<VerifyDepositResponse> {
  const res = await fetch("/api/deposit/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      txid: input.txid.trim(),
      user_id: input.userId,
      telegram_id: Number(input.telegramId) || undefined,
      first_name: input.firstName || "Trader",
      username: input.username || "",
    }),
  });

  const data = await res.json();
  return {
    status: res.ok && data.status === "success" ? "success" : "error",
    message: data.message || (res.ok ? "تم التحقق والإيداع بنجاح!" : "فشل التحقق من الإيداع"),
    amount_credited: data.amount_credited,
    new_balance: data.new_balance,
    user: data.user,
  };
}
