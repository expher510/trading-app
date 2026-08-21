import { ArrowRight, KeyRound, Link2, Loader2, Lock, Mail, Send, User, X } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "../services/auth";

export function AuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, setUser } = useAuthStore();
  const [tab, setTab] = useState<"LOGIN" | "REGISTER" | "LINK_CODE">("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [linkCodeInput, setLinkCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      if (tab === "LINK_CODE") {
        const cleanCode = linkCodeInput.trim().replace(/\s|-/g, "");
        if (cleanCode.length < 6) {
          setErrorMsg("يرجى إدخال كود الربط المكون من 6 أرقام.");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/user/redeem-link-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: cleanCode }),
        });

        const data = await res.json();
        if (res.ok && data.status === "success" && data.user) {
          setUser(data.user);
          setIsAuthModalOpen(false);
        } else {
          setErrorMsg(data.message || "كود الربط غير صالح أو منتهي الصلاحية.");
        }
        return;
      }

      const endpoint = tab === "LOGIN" ? "/api/user/login" : "/api/user/register";
      const body =
        tab === "LOGIN"
          ? { email: email.trim(), password }
          : { email: email.trim(), password, firstName: firstName.trim() || "Trader" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.status === "success" && data.user) {
        setUser(data.user);
        setIsAuthModalOpen(false);
      } else {
        setErrorMsg(data.message || "حدث خطأ أثناء تسجيل الدخول.");
      }
    } catch (err: any) {
      setErrorMsg("تعذر الاتصال بالسيرفر: " + (err?.message || "خطأ في الشبكة"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm dir-rtl">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-[#121212] p-6 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <h3 className="text-lg font-bold">حساب التداول والمنصة</h3>
            <p className="text-xs text-neutral-400">سجل الدخول لحفظ محفظتك ورصيدك والصفقات</p>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(false)}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-neutral-900 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("LOGIN");
              setErrorMsg("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
              tab === "LOGIN" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("REGISTER");
              setErrorMsg("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
              tab === "REGISTER" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            إنشاء حساب
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("LINK_CODE");
              setErrorMsg("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              tab === "LINK_CODE" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
          >
            <KeyRound className="h-3 w-3" />
            كود Telegram
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {tab === "LINK_CODE" ? (
            /* TAB 3: LINK CODE INPUT */
            <div className="space-y-3">
              <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-3 text-[11px] text-neutral-300 leading-relaxed space-y-1">
                <p className="font-bold text-emerald-400">📱 هل تملك حساباً في Telegram Mini App؟</p>
                <p>1. افتح صفحتك الشخصية في تليجرام واضغط <strong>"ربط بالويب"</strong>.</p>
                <p>2. أدخل الكود المكون من 6 أرقام هنا لفتح نفس حسابك ورصيدك فوراً!</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">كود الربط المكون من 6 أرقام:</label>
                <input
                  type="text"
                  maxLength={7}
                  required
                  placeholder="مثال: 748-291"
                  value={linkCodeInput}
                  onChange={(e) => setLinkCodeInput(e.target.value)}
                  className="w-full text-center tracking-widest font-mono text-lg font-bold rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-emerald-400 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || linkCodeInput.trim().length < 6}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-black hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد وربط الحساب"}
              </button>
            </div>
          ) : (
            /* TABS 1 & 2: EMAIL / PASSWORD */
            <>
              {tab === "REGISTER" && (
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">الاسم / اللقب:</label>
                  <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
                    <User className="h-4 w-4 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="مثال: أحمد"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-transparent text-xs text-white focus:outline-none placeholder-neutral-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">البريد الإلكتروني:</label>
                <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
                  <Mail className="h-4 w-4 text-neutral-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-xs text-white focus:outline-none placeholder-neutral-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">كلمة المرور:</label>
                <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
                  <Lock className="h-4 w-4 text-neutral-500" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-xs text-white focus:outline-none placeholder-neutral-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-xs font-bold text-black hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "LOGIN" ? "دخول" : "إنشاء حساب وبدء التداول"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
