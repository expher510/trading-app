import { Check, Copy, CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getDepositInfo, verifyDepositTxid, type DepositInfoResponse } from "../services/api/payment";
import { useTradingStore } from "../services/store";
import { useAuthStore } from "../services/auth";
import { setAccountBalance } from "../services/demo/engine";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txid, setTxid] = useState("");
  const [depositInfo, setDepositInfo] = useState<DepositInfoResponse>({
    wallet_address: "TCsuCvfmCtqsCxGW9H3wXbuCUUV4u8AhNC",
    coin: "USDT",
    network: "TRC20 / BEP20",
    min_deposit: 10.0,
  });
  const [resultMessage, setResultMessage] = useState<{
    status: "success" | "error";
    text: string;
    amount?: number;
    newBalance?: number;
  } | null>(null);

  const { accounts } = useTradingStore();
  const { user, updateUserBalance } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      getDepositInfo().then(setDepositInfo).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyTxid = async () => {
    if (!txid.trim()) return;

    setLoading(true);
    setResultMessage(null);

    try {
      const res = await verifyDepositTxid({
        txid: txid.trim(),
        userId: user?.id,
        telegramId: user?.telegram_id ? String(user.telegram_id) : undefined,
        firstName: user?.first_name || "Trader",
        username: user?.username || "",
      });

      if (res.status === "success" && res.amount_credited) {
        setResultMessage({
          status: "success",
          text: res.message,
          amount: res.amount_credited,
          newBalance: res.new_balance,
        });

        // Update balance in auth store
        if (res.new_balance !== undefined) {
          updateUserBalance(res.new_balance);
          setAccountBalance(res.new_balance);
        }

        // Credit the balance dynamically in Zustand store
        if (accounts.length > 0) {
          const acc = accounts[0];
          acc.balance = res.new_balance ?? (acc.balance + res.amount_credited);
          acc.equity = acc.balance;
          acc.freeMargin = acc.balance;
          useTradingStore.setState({ accounts: [...accounts] });
        }
      } else {
        setResultMessage({
          status: "error",
          text: res.message || "فشل التحقق من رقم المعاملة.",
        });
      }
    } catch (err: any) {
      setResultMessage({
        status: "error",
        text: "تعذر الاتصال بخادم التحقق: " + (err?.message || "خطأ في الشبكة"),
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const resetModal = () => {
    setTxid("");
    setResultMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm dir-rtl">
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#121212] p-5 sm:p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">إيداع رصيد (USDT Direct Deposit)</h3>
              <p className="text-xs text-neutral-400">تحويل مباشر وشحن فوري بالـ TXID</p>
            </div>
          </div>
          <button
            onClick={resetModal}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        {!resultMessage ? (
          <div className="mt-5 space-y-4">
            {/* Step 1: Wallet Address */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-neutral-300">
                  1. حوّل أي مبلغ إلى عنوان المحفظة ({depositInfo.coin} - {depositInfo.network}):
                </span>
                <span className="text-[11px] text-emerald-400 font-semibold">الحد الأدنى: ${depositInfo.min_deposit}</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-2.5">
                <input
                  type="text"
                  readOnly
                  value={depositInfo.wallet_address}
                  className="w-full bg-transparent text-xs font-mono text-emerald-400 focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(depositInfo.wallet_address)}
                  className="flex items-center gap-1 shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "تم النسخ" : "نسخ"}
                </button>
              </div>
            </div>

            {/* Step 2: TXID Input */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-medium text-neutral-300">
                2. أدخل رقم المعاملة (TXID) لتأكيد الإيداع فورياً:
              </label>
              <input
                type="text"
                placeholder="مثال: 7f8a9b... أو رقم المعاملة من محفظتك"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Instructions info box */}
            <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3 text-[11px] text-neutral-400 space-y-1">
              <p>• يمكنك تحويل أي مبلغ تريده من محفظتك الخارجية أو من بينانس.</p>
              <p>• سيتم التحقق من المعاملة وإضافة المبلغ المستلم تلقائياً إلى رصيدك فوراً.</p>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleVerifyTxid}
              disabled={loading || !txid.trim()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 font-bold text-xs text-black transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التحقق من شبكة البلوكشين وبينانس...
                </>
              ) : (
                "تأكيد المعاملة وإضافة الرصيد"
              )}
            </button>
          </div>
        ) : (
          /* Step 3: Success or Error Result */
          <div className="mt-6 space-y-5 text-center">
            {resultMessage.status === "success" ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <h4 className="text-lg font-bold text-emerald-400">تم شحن الحساب بنجاح! 🎉</h4>
                {resultMessage.amount && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-6 py-2">
                    <span className="text-2xl font-black text-emerald-400">+{resultMessage.amount} USDT</span>
                  </div>
                )}
                <p className="text-xs text-neutral-300 leading-relaxed px-2">
                  {resultMessage.text}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                  <X className="h-10 w-10" />
                </div>
                <h4 className="text-lg font-bold text-rose-400">تعذر تأكيد الإيداع</h4>
                <p className="text-xs text-neutral-300 leading-relaxed px-2">
                  {resultMessage.text}
                </p>
              </div>
            )}

            <button
              onClick={resetModal}
              className="w-full rounded-xl bg-neutral-800 py-3 text-xs font-bold text-white hover:bg-neutral-700 transition-colors"
            >
              {resultMessage.status === "success" ? "ابدأ التداول الآن" : "حاول مرة أخرى"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
