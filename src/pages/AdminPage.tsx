import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Users,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Edit3,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { toast } from "../services/toast.ts";

interface AdminStats {
  userCount: number;
  totalUserBalance: number;
  pendingRefundCount: number;
  pendingRefundSum: number;
  totalDepositCount: number;
  totalDepositSum: number;
}

interface WithdrawalItem {
  id: string;
  user_id: string;
  amount: number;
  wallet_address: string;
  network: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  email?: string;
  first_name?: string;
  telegram_id?: number;
  current_user_balance?: number;
}

interface AdminUser {
  id: string;
  email?: string;
  first_name?: string;
  telegram_id?: number;
  balance: number;
  created_at: string;
  deposit_count: number;
  total_deposited: number;
}

interface AuditLog {
  id: string;
  action: string;
  target_user_id: string;
  details: string;
  created_at: string;
  email?: string;
  first_name?: string;
  telegram_id?: number;
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("admin_session_token"));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState<"withdrawals" | "users" | "logs">("withdrawals");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Search & Filter
  const [withdrawalFilter, setWithdrawalFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [userSearch, setUserSearch] = useState("");

  // Modals / Actions state
  const [selectedUserForAdjust, setSelectedUserForAdjust] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"ADD" | "DEDUCT">("ADD");
  const [adjustReason, setAdjustReason] = useState("");
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const [rejectingWithdrawalId, setRejectingWithdrawalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [approvingWithdrawalId, setApprovingWithdrawalId] = useState<string | null>(null);
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("تم النسخ", "تم نسخ النص إلى الحافظة");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Authentication ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoggingIn(true);
    setLoginError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل تسجيل الدخول");
      }

      sessionStorage.setItem("admin_session_token", data.token);
      setToken(data.token);
      setPassword("");
      toast.success("مرحباً بك", "تم التحقق من صلاحيات الإدارة بنجاح");
    } catch (err: any) {
      setLoginError(err.message || "كلمة المرور غير صحيحة");
      toast.error("خطأ في الدخول", err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_session_token");
    setToken(null);
    toast.info("تسجيل خروج", "تم قفل لوحة التحكم بأمان");
  };

  // ── Data Fetching ──
  const fetchAllData = async () => {
    if (!token) return;
    setIsLoadingData(true);

    try {
      const headers = { "x-admin-token": token };

      const [statsRes, withRes, usersRes, logsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/withdrawals", { headers }),
        fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}`, { headers }),
        fetch("/api/admin/logs", { headers }),
      ]);

      if (statsRes.status === 401 || withRes.status === 401) {
        handleLogout();
        throw new Error("انتهت جلسة الإدارة. يرجى إعادة تسجيل الدخول.");
      }

      const [statsData, withData, usersData, logsData] = await Promise.all([
        statsRes.json(),
        withRes.json(),
        usersRes.json(),
        logsRes.json(),
      ]);

      setStats(statsData);
      setWithdrawals(withData);
      setUsers(usersData);
      setLogs(logsData);
    } catch (err: any) {
      toast.error("خطأ في جلب البيانات", err.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAllData();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const timeout = setTimeout(() => {
        fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}`, {
          headers: { "x-admin-token": token },
        })
          .then((r) => r.json())
          .then((data) => setUsers(data))
          .catch(() => {});
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [userSearch, token]);

  // ── Withdrawal Approval & Rejection ──
  const handleApproveWithdrawal = async (id: string) => {
    if (!token) return;
    setIsSubmittingApprove(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ note: "تم التحويل والاعتماد من لوحة التحكم" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشلت الموافقة على السحب");

      toast.success("تم اعتماد السحب", `تم تأكيد تحويل ${data.amount} USDT وتحديث حالة الطلب إلى مكتمل`);
      setApprovingWithdrawalId(null);
      fetchAllData();
    } catch (err: any) {
      toast.error("خطأ", err.message);
    } finally {
      setIsSubmittingApprove(false);
    }
  };

  const handleRejectWithdrawal = async () => {
    if (!token || !rejectingWithdrawalId) return;
    if (!rejectReason.trim()) {
      toast.error("تنبيه", "يرجى كتابة سبب الرفض");
      return;
    }

    setIsSubmittingReject(true);
    try {
      const res = await fetch(`/api/admin/withdrawals/${rejectingWithdrawalId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل رفض السحب");

      toast.info("تم الرفض واسترجاع الرصيد", "تم رفض الطلب وإرجاع المبلغ المخصوم إلى رصيد المستخدم تلقائياً");
      setRejectingWithdrawalId(null);
      setRejectReason("");
      fetchAllData();
    } catch (err: any) {
      toast.error("خطأ", err.message);
    } finally {
      setIsSubmittingReject(false);
    }
  };

  // ── Manual Balance Adjustment ──
  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedUserForAdjust) return;

    const parsed = parseFloat(adjustAmount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("خطأ", "يرجى إدخال مبلغ صحيح");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("خطأ", "يرجى كتابة سبب التعديل للتدقيق المحاسبي");
      return;
    }

    const delta = adjustType === "ADD" ? parsed : -parsed;

    setIsSubmittingAdjust(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserForAdjust.id}/adjust-balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ amount: delta, reason: adjustReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تعديل الرصيد");

      toast.success("تم تعديل الرصيد بنجاح", `الرصيد الجديد: ${data.user.balance} USDT`);
      setSelectedUserForAdjust(null);
      setAdjustAmount("");
      setAdjustReason("");
      fetchAllData();
    } catch (err: any) {
      toast.error("خطأ", err.message);
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // ── Filtered Withdrawals List ──
  const filteredWithdrawals = withdrawals.filter((w) => {
    if (withdrawalFilter === "ALL") return true;
    return w.status === withdrawalFilter;
  });

  // ── Render Login Screen if not authenticated ──
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07090e] p-4 text-white font-sans" dir="rtl">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d111a]/90 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/10 border border-amber-500/30 text-amber-400 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">بوابة الإدارة المركزية</h1>
            <p className="mt-1 text-xs text-neutral-400">لوحة التحكم الآمنة لإدارة الحسابات وطلبات السحب</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-neutral-300">
                مفتاح الدخول السري (Master Admin Key)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور الإدارة..."
                  className="w-full rounded-xl border border-white/10 bg-[#141a26] py-3 pr-4 pl-11 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 py-3 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:opacity-50"
            >
              {isLoggingIn ? "جاري التحقق..." : "تسجيل الدخول الآمن"}
            </button>
          </form>

          <div className="mt-6 border-t border-white/5 pt-4 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              العودة لمنصة التداول
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Full Dashboard ──
  return (
    <div className="min-h-screen bg-[#07090e] text-neutral-200 font-sans" dir="rtl">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0e17]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">لوحة تحكم الإدارة</h1>
              <p className="text-[11px] text-neutral-400">Trading MiniApp Admin Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={fetchAllData}
              disabled={isLoadingData}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121722] px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingData ? "animate-spin text-amber-400" : ""}`} />
              <span className="hidden sm:inline">تحديث البيانات</span>
            </button>

            <a
              href="/"
              className="rounded-lg border border-white/10 bg-[#121722] px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              منصة التداول
            </a>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0d111a]/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">إجمالي المتداولين</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-white">{stats?.userCount ?? 0}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d111a]/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">أرصدة المستخدمين</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">
              ${stats?.totalUserBalance?.toLocaleString() ?? "0.00"}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400">طلبات السحب المعلقة</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{stats?.pendingRefundCount ?? 0}</span>
              <span className="text-xs text-amber-400/80">(${stats?.pendingRefundSum ?? 0} USDT)</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d111a]/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">الإيداعات المكتملة</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                <ArrowDownLeft className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{stats?.totalDepositCount ?? 0}</span>
              <span className="text-xs text-teal-400/80">(${stats?.totalDepositSum ?? 0} USDT)</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 text-sm font-semibold">
          <button
            onClick={() => setActiveTab("withdrawals")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === "withdrawals"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            طلبات السحب والاسترداد
            {stats && stats.pendingRefundCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-black">
                {stats.pendingRefundCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === "users"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Users className="h-4 w-4" />
            إدارة المتداولين والأرصدة
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === "logs"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <FileText className="h-4 w-4" />
            سجل العمليات الإدارية
          </button>
        </div>

        {/* TAB 1: WITHDRAWALS */}
        {activeTab === "withdrawals" && (
          <div className="space-y-4">
            {/* Filter Chips */}
            <div className="flex items-center gap-2">
              {(["PENDING", "ALL", "APPROVED", "REJECTED"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setWithdrawalFilter(filter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    withdrawalFilter === filter
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "bg-[#121722] text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {filter === "PENDING" && "قيد المراجعة 🟡"}
                  {filter === "ALL" && "الكل 📋"}
                  {filter === "APPROVED" && "المعتمدة 🟢"}
                  {filter === "REJECTED" && "المرفوضة 🔴"}
                </button>
              ))}
            </div>

            {/* Withdrawals Table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-white/10 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">المتداول</th>
                      <th className="px-4 py-3 font-semibold">المبلغ المطلوب</th>
                      <th className="px-4 py-3 font-semibold">محفظة الاستلام (TRC20)</th>
                      <th className="px-4 py-3 font-semibold">الرصيد المتاح</th>
                      <th className="px-4 py-3 font-semibold">الحالة</th>
                      <th className="px-4 py-3 font-semibold">التاريخ</th>
                      <th className="px-4 py-3 font-semibold text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredWithdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                          لا توجد طلبات سحب في هذا القسم.
                        </td>
                      </tr>
                    ) : (
                      filteredWithdrawals.map((w) => (
                        <tr key={w.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{w.first_name || "متداول"}</div>
                            <div className="text-[11px] text-neutral-400">{w.email || `TG: ${w.telegram_id || "—"}`}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-sm font-bold text-amber-400">
                              {w.amount.toFixed(2)} USDT
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono">
                            <div className="flex items-center gap-1.5">
                              <span className="max-w-[140px] truncate text-neutral-300">{w.wallet_address}</span>
                              <button
                                onClick={() => copyToClipboard(w.wallet_address, w.id)}
                                className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
                                title="نسخ المحفظة"
                              >
                                {copiedId === w.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                            <span className="text-[10px] text-neutral-500">شبكة {w.network}</span>
                          </td>
                          <td className="px-4 py-3.5 font-mono font-medium text-emerald-400">
                            ${(w.current_user_balance ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5">
                            {w.status === "PENDING" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                                <Clock className="h-3 w-3" /> قيد المراجعة
                              </span>
                            )}
                            {w.status === "APPROVED" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> معتمد ومحول
                              </span>
                            )}
                            {w.status === "REJECTED" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-400" title={w.reason}>
                                <XCircle className="h-3 w-3" /> مرفوض
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-neutral-400 text-[11px]">
                            {new Date(w.created_at).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {w.status === "PENDING" ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => setApprovingWithdrawalId(w.id)}
                                  className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-400 transition hover:bg-emerald-500 hover:text-black"
                                >
                                  موافقة ✅
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingWithdrawalId(w.id);
                                    setRejectReason("");
                                  }}
                                  className="rounded-lg bg-red-500/15 border border-red-500/30 px-2.5 py-1 text-[11px] font-bold text-red-400 transition hover:bg-red-500 hover:text-white"
                                >
                                  رفض ❌
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-neutral-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USERS & BALANCE ADJUSTMENT */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative max-w-md">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="بحث بالاسم، الإيميل، أو Telegram ID..."
                className="w-full rounded-xl border border-white/10 bg-[#0d111a] py-2.5 pr-10 pl-4 text-xs text-white placeholder-neutral-500 outline-none transition focus:border-amber-500/60"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            </div>

            {/* Users Table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-white/10 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">المتداول</th>
                      <th className="px-4 py-3 font-semibold">Telegram ID</th>
                      <th className="px-4 py-3 font-semibold">الرصيد الحالي</th>
                      <th className="px-4 py-3 font-semibold">إجمالي الإيداعات</th>
                      <th className="px-4 py-3 font-semibold">تاريخ التسجيل</th>
                      <th className="px-4 py-3 font-semibold text-center">إجراءات الحساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                          لم يتم العثور على أي متداولين مطابقين.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{u.first_name || "مستخدم جديد"}</div>
                            <div className="text-[11px] text-neutral-400">{u.email || u.id}</div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-neutral-300">
                            {u.telegram_id ? (
                              <span className="rounded bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[11px] text-sky-400 font-semibold">
                                @{u.telegram_id}
                              </span>
                            ) : (
                              <span className="text-neutral-500">حساب ويب</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-sm font-bold text-emerald-400">
                            ${u.balance.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-neutral-300">
                            ${(u.total_deposited || 0).toFixed(2)} ({u.deposit_count || 0})
                          </td>
                          <td className="px-4 py-3.5 text-neutral-400 text-[11px]">
                            {new Date(u.created_at).toLocaleDateString("ar-EG")}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => {
                                setSelectedUserForAdjust(u);
                                setAdjustAmount("");
                                setAdjustReason("");
                                setAdjustType("ADD");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-400 transition hover:bg-amber-500 hover:text-black"
                            >
                              <Edit3 className="h-3 w-3" />
                              تعديل الرصيد
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d111a]">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-white/10 bg-white/5 text-neutral-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">نوع العملية</th>
                      <th className="px-4 py-3 font-semibold">المستخدم المستهدف</th>
                      <th className="px-4 py-3 font-semibold">التفاصيل</th>
                      <th className="px-4 py-3 font-semibold">الوقت والتاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                          لا توجد سجلات إدارية بعد.
                        </td>
                      </tr>
                    ) : (
                      logs.map((l) => (
                        <tr key={l.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3.5">
                            {l.action === "APPROVE_WITHDRAWAL" && (
                              <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                اعتماد سحب ✅
                              </span>
                            )}
                            {l.action === "REJECT_WITHDRAWAL" && (
                              <span className="rounded bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                                رفض سحب ❌
                              </span>
                            )}
                            {l.action === "ADJUST_BALANCE" && (
                              <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                تعديل رصيد ✏️
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-white">{l.first_name || l.email || l.target_user_id}</span>
                          </td>
                          <td className="px-4 py-3.5 text-neutral-300">{l.details}</td>
                          <td className="px-4 py-3.5 text-neutral-400 text-[11px]">
                            {new Date(l.created_at).toLocaleString("ar-EG")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: ADJUST BALANCE DIALOG */}
      {selectedUserForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0d111a] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">تعديل رصيد المتداول</h3>
            <p className="mt-1 text-xs text-neutral-400">
              المتداول: <span className="font-semibold text-amber-400">{selectedUserForAdjust.first_name || selectedUserForAdjust.email}</span> (الرصيد الحالي: ${selectedUserForAdjust.balance.toFixed(2)})
            </p>

            <form onSubmit={handleAdjustBalance} className="mt-4 space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#141a26] p-1">
                <button
                  type="button"
                  onClick={() => setAdjustType("ADD")}
                  className={`rounded-lg py-2 text-xs font-bold transition ${
                    adjustType === "ADD" ? "bg-emerald-500 text-black" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  ➕ إضافة رصيد / بونص
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType("DEDUCT")}
                  className={`rounded-lg py-2 text-xs font-bold transition ${
                    adjustType === "DEDUCT" ? "bg-red-500 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  ➖ خصم رصيد
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-300">المبلغ بالـ USDT</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="مثال: 50"
                  className="w-full rounded-xl border border-white/10 bg-[#141a26] p-3 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-300">السبب (مطلوب لتدقيق الحسابات)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="مثال: بونص ترحيبي، تصحيح إيداع، إلخ..."
                  className="w-full rounded-xl border border-white/10 bg-[#141a26] p-3 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {isSubmittingAdjust ? "جاري الحفظ..." : "حفظ التعديل"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUserForAdjust(null)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM WITHDRAWAL APPROVAL */}
      {approvingWithdrawalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0d111a] p-6 shadow-2xl text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white">تأكيد اعتماد السحب</h3>
            <p className="mt-1.5 text-xs text-neutral-300">
              هل قمت بتحويل المبلغ إلى محفظة المتداول وترغب في اعتماد الطلب وخصم المبلغ من حسابه الآن؟
            </p>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => handleApproveWithdrawal(approvingWithdrawalId)}
                disabled={isSubmittingApprove}
                className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {isSubmittingApprove ? "جاري الاعتماد..." : "نعم، تم التحويل والاعتماد"}
              </button>
              <button
                onClick={() => setApprovingWithdrawalId(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REJECT WITHDRAWAL DIALOG */}
      {rejectingWithdrawalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0d111a] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">رفض طلب السحب</h3>
            <p className="mt-1 text-xs text-neutral-400">يرجى كتابة سبب الرفض لتوضيحه للمتداول:</p>

            <div className="mt-3">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="مثال: عنوان المحفظة غير صحيح، أو تم إلغاء الطلب بناءً على رغبة العميل..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-[#141a26] p-3 text-xs text-white placeholder-neutral-500 outline-none focus:border-red-500"
                required
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleRejectWithdrawal}
                disabled={isSubmittingReject}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {isSubmittingReject ? "جاري الرفض..." : "تأكيد الرفض"}
              </button>
              <button
                onClick={() => setRejectingWithdrawalId(null)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
