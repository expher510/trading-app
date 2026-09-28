import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  History,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "../lib/utils";
import { useAuthStore } from "../services/auth";
import { useTradingStore } from "../services/store";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeposit: () => void;
}

interface DepositRecord {
  id: string;
  txid: string;
  amount: number;
  coin: string;
  network: string;
  status: string;
  created_at: string;
}

export function UserProfileModal({ isOpen, onClose, onOpenDeposit }: UserProfileModalProps) {
  const { user, logout } = useAuthStore();
  const accounts = useTradingStore((s) => s.accounts);
  const activeAccount = accounts[0];

  const liveBalance = activeAccount?.balance ?? user?.balance ?? 0;
  const liveEquity = activeAccount?.equity ?? liveBalance;

  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "DEPOSITS" | "REFUND" | "LINK_WEB">("OVERVIEW");
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [copiedTxid, setCopiedTxid] = useState<string | null>(null);

  // Link Code State
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [copiedLinkCode, setCopiedLinkCode] = useState(false);

  // Flexible Refund Form State
  const [refundAmount, setRefundAmount] = useState("");
  const [refundAddress, setRefundAddress] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);
  const [refundTelegramLink, setRefundTelegramLink] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.id) {
      // 1. Sync latest fresh user balance from DB
      fetch(`/api/user/${user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "success" && data.user) {
            useAuthStore.getState().setUser(data.user);
          }
        })
        .catch(() => {});

      // 2. Load deposits history
      setLoadingDeposits(true);
      fetch(`/api/user/${user.id}/deposits`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status === "success" && data.deposits) {
            setDeposits(data.deposits);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingDeposits(false));
    }
  }, [isOpen, user?.id]);

  if (!isOpen || !user) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTxid(text);
    setTimeout(() => setCopiedTxid(null), 2500);
  };

  const handleGenerateLinkCode = async () => {
    setLinkCodeLoading(true);
    try {
      const res = await fetch("/api/user/generate-link-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          telegram_id: user.telegram_id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success" && data.code) {
        setLinkCode(data.code);
      }
    } catch {
      alert("تعذر إنشاء كود الربط. تأكد من اتصال الإنترنت.");
    } finally {
      setLinkCodeLoading(false);
    }
  };

  const copyLinkCode = () => {
    if (!linkCode) return;
    navigator.clipboard.writeText(linkCode);
    setCopiedLinkCode(true);
    setTimeout(() => setCopiedLinkCode(false), 2500);
  };

  const handleSetPercentAmount = (percent: number) => {
    if (liveBalance <= 0) return;
    const calculated = (liveBalance * (percent / 100)).toFixed(2);
    setRefundAmount(calculated);
    setRefundError(null);
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundLoading(true);
    setRefundError(null);
    setRefundSuccess(null);
    setRefundTelegramLink(null);

    const amountNum = Number(refundAmount);
    if (!amountNum || amountNum <= 0) {
      setRefundError("يرجى إدخال مبلغ سحب صحيح أكبر من 0.");
      setRefundLoading(false);
      return;
    }

    if (amountNum > liveBalance) {
      setRefundError(`المبلغ المطلوب ($${amountNum}) أكبر من رصيدك المتاح ($${liveBalance.toFixed(2)}).`);
      setRefundLoading(false);
      return;
    }

    if (!refundAddress.trim()) {
      setRefundError("يرجى إدخال عنوان محفظة استلام صالحة (USDT TRC20).");
      setRefundLoading(false);
      return;
    }

    try {
      // 1. Record refund in internal SQLite DB
      const res = await fetch("/api/user/refund-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          amount: amountNum,
          wallet_address: refundAddress.trim(),
          network: "TRX",
          reason: refundReason.trim() || `طلب سحب مبلغ ${amountNum} USDT`,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.status !== "success") {
        throw new Error(data.message || "تعذر تسجيل طلب السحب.");
      }

      // Update user state and balance immediately across all app stores
      if (data.user) {
        useAuthStore.getState().setUser(data.user);
      } else {
        const newBalance = Math.max(0, liveBalance - amountNum);
        useAuthStore.getState().updateUserBalance(newBalance);
      }

      // 2. Prepare Direct Telegram Message to @AliSaad555
      const nowStr = new Date().toLocaleString("ar-EG");
      const tgMessage =
        `🔔 *طلب سحب / استرداد أموال جديد*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *المستخدم:* ${user.first_name || user.username || "المتداول"}\n` +
        `📧 *البريد:* ${user.email || "حساب تليجرام"}\n` +
        `📱 *تليجرام ID:* ${user.telegram_id || "غير مسجل"}\n` +
        `🆔 *معرف الحساب:* \`${user.id}\`\n` +
        `💰 *المبلغ المطلوب سحبه:* *${amountNum.toFixed(2)} USDT*\n` +
        `💼 *الرصيد المتبقي في الحساب:* $${((data.user?.balance ?? (liveBalance - amountNum))).toFixed(2)} USDT\n` +
        `🏦 *محفظة الاستلام:* \`${refundAddress.trim()}\` (شبكة TRC20)\n` +
        `📝 *ملاحظات:* ${refundReason.trim() || "طلب سحب رصيد"}\n` +
        `⏰ *الوقت:* ${nowStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `يرجى مراجعة التحويل وإرسال المبلغ.`;

      const directTgUrl = `https://t.me/AliSaad555?text=${encodeURIComponent(tgMessage)}`;
      setRefundTelegramLink(directTgUrl);

      // 3. Auto-open Telegram chat to @AliSaad555
      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp && typeof tgApp.openTelegramLink === "function") {
        tgApp.openTelegramLink(directTgUrl);
      } else {
        window.open(directTgUrl, "_blank");
      }

      setRefundSuccess(`تم تسجيل طلب سحب $${amountNum.toFixed(2)} USDT وخصم المبلغ من رصيدك فورياً بنجاح! جاري فتح Telegram للتواصل مع الإدارة.`);
      setRefundAmount("");
      setRefundAddress("");
      setRefundReason("");
    } catch (err: any) {
      setRefundError(err?.message || "تعذر الاتصال بالسيرفر");
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-sm dir-rtl">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-[#121212] shadow-2xl text-white flex flex-col max-h-[92vh]">
        {/* Header Profile Bar */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-5 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-xl border border-emerald-500/30">
              {(user.first_name || user.username || user.email || "U")[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">
                  {user.first_name || user.username || (user.email ? user.email.split("@")[0] : "المتداول")}
                </h3>
                {user.telegram_id && (
                  <span className="flex items-center gap-1 rounded-full bg-[#229ED9]/20 px-2 py-0.5 text-[10px] font-semibold text-[#229ED9] border border-[#229ED9]/30">
                    <Send className="h-2.5 w-2.5" /> Telegram ID: {user.telegram_id}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">
                {user.email || "حساب تليجرام موثق"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              title="تسجيل الخروج"
              className="flex items-center gap-1 rounded-xl bg-neutral-800/80 hover:bg-rose-500/20 hover:text-rose-400 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors border border-neutral-700/50"
            >
              <LogOut className="h-3.5 w-3.5" />
              خروج
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-900/30 px-5 pt-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("OVERVIEW")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors shrink-0 ${
              activeTab === "OVERVIEW"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Wallet className="h-4 w-4" />
            نظرة عامة والمحفظة
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("DEPOSITS")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors shrink-0 ${
              activeTab === "DEPOSITS"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <History className="h-4 w-4" />
            سجل الإيداعات ({deposits.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LINK_WEB")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors shrink-0 ${
              activeTab === "LINK_WEB"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Link2 className="h-4 w-4" />
            ربط بالويب (Link Code)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("REFUND")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors shrink-0 ${
              activeTab === "REFUND"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            سحب الرصيد / استرداد
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "OVERVIEW" && (
            <div className="space-y-4">
              {/* Balance Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
                  <span className="text-xs text-neutral-400 block mb-1">الرصيد المتاح (Balance):</span>
                  <span className="text-2xl font-black text-white font-mono">
                    ${formatNumber(liveBalance, 2)}
                  </span>
                  <span className="text-[10px] text-neutral-500 block mt-1">USDT TRC20 / BEP20</span>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-sm">
                  <span className="text-xs text-neutral-400 block mb-1">حقوق الملكية الحية (Equity):</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    ${formatNumber(liveEquity, 2)}
                  </span>
                  <span className="text-[10px] text-neutral-500 block mt-1">شامل الأرباح/الخسائر المفتوحة</span>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDeposit();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-bold text-black hover:bg-emerald-400 active:scale-95 transition-all shadow-md shadow-emerald-500/10"
                >
                  <CreditCard className="h-4 w-4" />
                  إيداع رصيد جديد
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("REFUND")}
                  className="flex items-center justify-center gap-2 rounded-xl bg-neutral-800 border border-neutral-700 py-3.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700 active:scale-95 transition-all"
                >
                  <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
                  سحب الرصيد
                </button>
              </div>

              {/* Account Info Details */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-2 text-xs">
                <h4 className="font-bold text-neutral-300 mb-2">معلومات الحساب:</h4>
                <div className="flex justify-between py-1 border-b border-neutral-800/60">
                  <span className="text-neutral-400">معرف المستخدم (User ID):</span>
                  <span className="font-mono text-neutral-300">{user.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800/60">
                  <span className="text-neutral-400">تاريخ الإنشاء:</span>
                  <span className="text-neutral-300">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("ar-EG") : "اليوم"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-neutral-400">حالة الحساب:</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5" /> نشط وموثق
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEPOSIT HISTORY */}
          {activeTab === "DEPOSITS" && (
            <div className="space-y-3">
              {loadingDeposits ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                  <span className="text-xs">جاري تحميل سجل الإيداعات...</span>
                </div>
              ) : deposits.length === 0 ? (
                <div className="text-center py-10 text-neutral-400 space-y-2">
                  <History className="h-8 w-8 mx-auto text-neutral-600" />
                  <p className="text-xs">لا توجد عمليات إيداع سابقة في حسابك حتى الآن.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deposits.map((dep) => (
                    <div
                      key={dep.id}
                      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-2 transition-all hover:border-neutral-700"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                            <ArrowUpRight className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-sm font-black text-emerald-400 font-mono">
                              +{dep.amount} {dep.coin}
                            </span>
                            <span className="text-[10px] text-neutral-500 block">شبكة {dep.network}</span>
                          </div>
                        </div>

                        <div className="text-left">
                          <span className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            مكتمل بنجاح
                          </span>
                          <span className="text-[10px] text-neutral-500 block mt-1">
                            {new Date(dep.created_at).toLocaleString("ar-EG")}
                          </span>
                        </div>
                      </div>

                      {/* TXID Row */}
                      <div className="flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-mono text-neutral-400">
                        <span className="truncate max-w-[280px]">TXID: {dep.txid}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(dep.txid)}
                          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:underline shrink-0"
                        >
                          {copiedTxid === dep.txid ? (
                            <>
                              <Check className="h-3 w-3" /> تم النسخ
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" /> نسخ
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LINK TO WEB */}
          {activeTab === "LINK_WEB" && (
            <div className="space-y-4 text-center">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mx-auto">
                  <KeyRound className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-white">ربط حسابك بمتصفح الويب (الكمبيوتر)</h4>
                <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
                  قم بإنشاء كود ربط سري لفتح نفس هذا الحساب بكامل رصيده وصفقاته على جهاز الكمبيوتر أو أي متصفح ويب.
                </p>

                {linkCode ? (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-center gap-2">
                      <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-mono font-black text-3xl tracking-widest text-emerald-400 select-all shadow-lg shadow-emerald-500/10">
                        {linkCode.slice(0, 3)} - {linkCode.slice(3)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={copyLinkCode}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 transition-colors"
                    >
                      {copiedLinkCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      {copiedLinkCode ? "تم نسخ كود الربط!" : "نسخ الكود"}
                    </button>
                    <p className="text-[11px] text-neutral-500">⏳ الكود صالح للاستخدام لمرة واحدة لمدة 15 دقيقة.</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateLinkCode}
                    disabled={linkCodeLoading}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-black hover:bg-emerald-400 active:scale-95 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
                  >
                    {linkCodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء كود الربط الآن (6 أرقام)"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REFUND / WITHDRAWAL */}
          {activeTab === "REFUND" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-neutral-300 leading-relaxed">
                <p className="font-bold text-emerald-400 mb-1">💡 سحب واسترداد الرصيد:</p>
                <p>يمكنك سحب أي جزء تريده من رصيدك المتاح (${liveBalance.toFixed(2)} USDT) أو سحب الرصيد بالكامل وسيتم توجيهك إلى تليجرام <strong>@AliSaad555</strong> لتنفيذ التحويل.</p>
              </div>

              {refundSuccess && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 p-3.5 text-xs text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldCheck className="h-5 w-5 shrink-0" />
                    <span>{refundSuccess}</span>
                  </div>
                  {refundTelegramLink && (
                    <a
                      href={refundTelegramLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-black hover:bg-emerald-400 transition-colors shadow-sm"
                    >
                      <Send className="h-3.5 w-3.5" />
                      فتح محادثة Telegram مع @AliSaad555 الآن
                    </a>
                  )}
                </div>
              )}

              {refundError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/20 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <X className="h-5 w-5 shrink-0" />
                  <span>{refundError}</span>
                </div>
              )}

              <form onSubmit={handleRefundSubmit} className="space-y-3">
                {/* Flexible Amount Input with Percentage Chips */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-neutral-300">
                      المبلغ المطلوب سحبه (USDT):
                    </label>
                    <span className="text-[11px] font-mono text-neutral-400">
                      الرصيد المتاح: <strong className="text-emerald-400">${formatNumber(liveBalance, 2)}</strong>
                    </span>
                  </div>

                  <input
                    type="number"
                    step="any"
                    min="1"
                    max={liveBalance}
                    required
                    placeholder={`أدخل المبلغ (الحد الأقصى: ${liveBalance.toFixed(2)})`}
                    value={refundAmount}
                    onChange={(e) => {
                      setRefundAmount(e.target.value);
                      setRefundError(null);
                    }}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm font-mono text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  />

                  {/* Percentage Quick Selection Chips */}
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetPercentAmount(25)}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 py-1.5 text-[11px] font-bold text-neutral-300 hover:text-white transition-colors"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPercentAmount(50)}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 py-1.5 text-[11px] font-bold text-neutral-300 hover:text-white transition-colors"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPercentAmount(75)}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 py-1.5 text-[11px] font-bold text-neutral-300 hover:text-white transition-colors"
                    >
                      75%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPercentAmount(100)}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 py-1.5 text-[11px] font-bold text-emerald-400 transition-colors"
                    >
                      الكل (100%)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">عنوان محفظة الاستلام (USDT TRC20):</label>
                  <input
                    type="text"
                    required
                    placeholder="T..."
                    value={refundAddress}
                    onChange={(e) => setRefundAddress(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs text-white font-mono placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">ملاحظات إضافية (اختياري):</label>
                  <textarea
                    rows={2}
                    placeholder="أدخل أي ملاحظات ترغب في إرفاقها لمسؤول المنصة..."
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={refundLoading || liveBalance <= 0 || !refundAmount || !refundAddress.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-xs font-bold text-black hover:bg-emerald-400 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-emerald-500/10"
                >
                  {refundLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      إرسال طلب السحب والتوجيه إلى Telegram (@AliSaad555)
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
