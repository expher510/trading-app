/**
 * ─── Mobile Trading Panel ────────────────────────────────────────
 * Touch-optimized quick-order entry panel for mobile devices.
 * Provides large tap targets, swipeable panels, and quick preset
 * lot sizes for one-tap order placement.
 */
import { useState, useRef, useCallback } from "react";
import { CreditCard, LogIn, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstrumentLabels } from "../hooks/useInstrumentLabels.ts";
import { useAuthStore } from "../services/auth.ts";

interface MobilePosition {
  id: string;
  symbol?: string;
  symbolName?: string;
  side?: "LONG" | "SHORT" | "BUY" | "SELL";
  pnl?: number;
  unrealizedPnl?: number;
  quantity?: number;
  entryPrice?: number;
  [key: string]: unknown;
}

interface MobileTradingPanelProps {
  symbol: string;
  bid?: number;
  ask?: number;
  spread?: number;
  accountBalance?: number;
  onPlaceOrder: (order: {
    side: "BUY" | "SELL";
    quantity: number;
    type: "MARKET" | "LIMIT" | "STOP";
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    symbol: string;
    accountId?: string;
  }) => void;
  positions: MobilePosition[];
  onClosePosition?: (positionId: string) => void;
  onCloseAllPositions?: () => void;
  /** ID of the position currently being closed — disables that row's Close button */
  closingPositionId?: string | null;
  /** True while close-all is in flight — disables the Close All button */
  closingAll?: boolean;
  onOpenDeposit?: () => void;
}

type Tab = "order" | "positions" | "alerts";

const LOT_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0];
const TABS: Tab[] = ["order", "positions", "alerts"];

export function MobileTradingPanel({
  symbol,
  bid = 0,
  ask = 0,
  spread: spreadProp,
  accountBalance = 0,
  onPlaceOrder,
  positions,
  onClosePosition,
  onCloseAllPositions,
  closingPositionId = null,
  closingAll = false,
  onOpenDeposit,
}: MobileTradingPanelProps) {
  const { formatQty } = useInstrumentLabels();
  const spread = spreadProp ?? ask - bid;
  const [activeTab, setActiveTab] = useState<Tab>("order");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [quantity, setQuantity] = useState(0.1);
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Swipe tracking
  const touchStartX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]!.clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - touchStartX.current;
      if (Math.abs(dx) > 60) {
        const currentIdx = TABS.indexOf(activeTab);
        if (dx > 0 && currentIdx > 0) {
          setActiveTab(TABS[currentIdx - 1]!);
        } else if (dx < 0 && currentIdx < TABS.length - 1) {
          setActiveTab(TABS[currentIdx + 1]!);
        }
      }
    },
    [activeTab],
  );

  const handleOrder = (side: "BUY" | "SELL") => {
    onPlaceOrder({
      side,
      quantity,
      type: orderType,
      symbol,
      price: orderType !== "MARKET" && limitPrice ? Number(limitPrice) : undefined,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      takeProfit: takeProfit ? Number(takeProfit) : undefined,
    });
  };

  const totalPnl = positions.reduce((sum: number, p) => sum + (p.pnl ?? p.unrealizedPnl ?? 0), 0);
  const openPositionCount = positions.filter((p) => (p.symbol ?? p.symbolName) === symbol).length;

  return (
    <div
      className="md:hidden flex flex-col bg-slate-900 border-t border-slate-700 safe-area-bottom"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Tab bar */}
      <div className="flex border-b border-slate-700">
        {[
          { key: "order" as const, label: "Order" },
          { key: "positions" as const, label: `Positions (${positions.length})` },
          { key: "alerts" as const, label: "Alerts" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition",
              activeTab === tab.key
                ? "text-violet-400 border-b-2 border-violet-500"
                : "text-slate-500",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ORDER TAB */}
      {activeTab === "order" && (
        <div className="p-3 space-y-3">
          {/* Symbol + Spread */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">{symbol}</span>
            <span className="text-xs text-slate-500">
              Spread: <span className="text-amber-400">{spread.toFixed(1)} pts</span>
            </span>
          </div>

          {/* Order type selector */}
          <div className="flex gap-1.5">
            {(["MARKET", "LIMIT", "STOP"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-medium transition",
                  orderType === t ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Limit/Stop price input */}
          {orderType !== "MARKET" && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                {orderType === "LIMIT" ? "Limit Price" : "Stop Price"}
              </label>
              <input
                type="number"
                step="any"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={bid.toFixed(5)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono text-center focus:ring-2 focus:ring-violet-500"
              />
            </div>
          )}

          {/* Lot size presets */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">
              Lot Size: <span className="text-white font-mono">{quantity}</span>
            </label>
            <div className="grid grid-cols-3 min-[400px]:grid-cols-6 gap-1.5">
              {LOT_PRESETS.map((lot) => (
                <button
                  key={lot}
                  onClick={() => setQuantity(lot)}
                  className={cn(
                    "py-2.5 rounded-lg text-xs font-mono font-medium transition active:scale-95",
                    quantity === lot
                      ? "bg-violet-600 text-white ring-1 ring-violet-400"
                      : "bg-slate-800 text-slate-300",
                  )}
                >
                  {lot}
                </button>
              ))}
            </div>
            {/* Custom input */}
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0.01)}
              className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono text-center focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Advanced (SL/TP) toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition"
          >
            {showAdvanced ? "▾ Hide SL/TP" : "▸ Set Stop Loss / Take Profit"}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-red-400 mb-1 block">Stop Loss</label>
                <input
                  type="number"
                  step="any"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2 py-2 bg-slate-800 border border-red-500/30 rounded-lg text-white text-xs font-mono text-center focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="text-xs text-emerald-400 mb-1 block">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2 py-2 bg-slate-800 border border-emerald-500/30 rounded-lg text-white text-xs font-mono text-center focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* BUY / SELL buttons — large touch targets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleOrder("SELL")}
              className="py-4 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 active:scale-[0.98] text-white font-bold transition-all"
            >
              <div className="text-lg">SELL</div>
              <div className="text-xs font-mono opacity-80">{bid.toFixed(5)}</div>
            </button>
            <button
              onClick={() => handleOrder("BUY")}
              className="py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-[0.98] text-white font-bold transition-all"
            >
              <div className="text-lg">BUY</div>
              <div className="text-xs font-mono opacity-80">{ask.toFixed(5)}</div>
            </button>
          </div>

          {/* Account info + Deposit Shortcut */}
          <div className="flex justify-between items-center text-xs text-slate-400 pt-1.5 border-t border-slate-800">
            <span className="font-mono">
              الرصيد: <strong className="text-emerald-400">${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            {onOpenDeposit && (
              <button
                type="button"
                onClick={onOpenDeposit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold active:scale-95 transition-all"
              >
                <CreditCard className="h-3 w-3" />
                إيداع
              </button>
            )}
            <span>الصفقات: {openPositionCount}</span>
          </div>
        </div>
      )}

      {/* POSITIONS TAB */}
      {activeTab === "positions" && (
        <div className="p-3 space-y-2 max-h-[50vh] overflow-y-auto">
          {positions.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No open positions</div>
          ) : (
            <>
              {/* Total P&L bar */}
              <div className="flex items-center justify-between bg-slate-800/60 rounded-lg p-2.5">
                <span className="text-xs text-slate-400">
                  Total P&L ({positions.length} positions)
                </span>
                <span
                  className={cn(
                    "font-mono font-bold text-sm",
                    totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </span>
              </div>

              {/* Position cards */}
              {positions.map((pos) => {
                const posSymbol = pos.symbol ?? pos.symbolName ?? "";
                const posSide =
                  pos.side === "LONG" ? "BUY" : pos.side === "SHORT" ? "SELL" : pos.side;
                const posPnl = pos.pnl ?? pos.unrealizedPnl ?? 0;
                return (
                  <div
                    key={pos.id}
                    className="bg-slate-800/40 border border-slate-700 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-bold",
                            posSide === "BUY"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400",
                          )}
                        >
                          {posSide}
                        </span>
                        <span className="text-sm font-medium text-white">{posSymbol}</span>
                        <span className="text-xs text-slate-500">
                          {formatQty(pos.quantity ?? 0)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-sm font-bold",
                          posPnl >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {posPnl >= 0 ? "+" : ""}${posPnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-mono">
                        Entry: {pos.entryPrice?.toFixed(5) ?? "—"}
                      </span>
                      {onClosePosition && (
                        <button
                          onClick={() => onClosePosition(pos.id)}
                          disabled={closingPositionId === pos.id || closingAll}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium transition active:scale-95",
                            closingPositionId === pos.id
                              ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                              : "bg-slate-700 hover:bg-red-600/40 active:bg-red-600/60 text-slate-300 hover:text-white",
                          )}
                        >
                          {closingPositionId === pos.id ? "Closing…" : "Close"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Close all button */}
              {positions.length > 1 && onCloseAllPositions && (
                <button
                  onClick={onCloseAllPositions}
                  disabled={closingAll}
                  className={cn(
                    "w-full py-3 rounded-xl text-sm font-semibold transition active:scale-[0.98]",
                    closingAll
                      ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                      : "bg-red-600/20 hover:bg-red-600/30 active:bg-red-600/40 text-red-400",
                  )}
                >
                  {closingAll ? "Closing All…" : "Close All Positions"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ALERTS TAB */}
      {activeTab === "alerts" && (
        <div className="p-3 space-y-3">
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">Price alerts coming soon</p>
            <p className="text-xs text-slate-600 mt-1">
              Set alerts for price levels and get push notifications
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mobile-optimized account summary and actions strip shown at top of trading page (<768px).
 * Provides direct 1-tap access to Login/User Profile, Live Balance/Equity, and Deposit.
 */
export function MobileAccountBar({
  balance,
  equity,
  margin: _margin,
  pnl,
  onOpenDeposit,
}: {
  balance: number;
  equity: number;
  margin: number;
  pnl: number;
  onOpenDeposit?: () => void;
}) {
  const { user, setIsAuthModalOpen, setIsProfileModalOpen } = useAuthStore();

  return (
    <div className="md:hidden flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-[#0e1118]/95 backdrop-blur-md border-b border-neutral-800 text-xs shadow-md select-none">
      {/* 1. Login / Account Profile button */}
      <button
        type="button"
        onClick={() => (user ? setIsProfileModalOpen(true) : setIsAuthModalOpen(true))}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 active:scale-95 border border-neutral-700/60 text-white font-medium text-xs transition-all shadow-sm shrink-0 max-w-[130px]"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <User className="h-3 w-3" />
        </div>
        <span className="truncate text-[11px] font-semibold">
          {user
            ? user.first_name || user.username || (user.email ? user.email.split("@")[0] : "حسابي")
            : "تسجيل الدخول"}
        </span>
      </button>

      {/* 2. Balance & Live Status */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-950/90 border border-neutral-800/80 shadow-inner shrink-0">
        <div className="flex flex-col items-center leading-tight">
          <div className="flex items-center gap-1 font-mono font-bold text-emerald-400 text-[11px] sm:text-xs">
            <span className="text-[9px] text-neutral-400 font-sans font-normal">الرصيد:</span>
            <span>${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {equity !== balance && (
            <div className="flex items-center gap-1 text-[9px] font-mono">
              <span className="text-neutral-400">Equity:</span>
              <span className={equity >= balance ? "text-emerald-400" : "text-rose-400"}>
                ${equity.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              {pnl !== 0 && (
                <span className={pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  ({pnl >= 0 ? "+" : ""}${pnl.toFixed(2)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Deposit Button */}
      {onOpenDeposit && (
        <button
          type="button"
          onClick={onOpenDeposit}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-neutral-950 font-bold text-xs shadow-md shadow-emerald-500/20 border border-emerald-400/40 transition-all shrink-0"
        >
          <CreditCard className="h-3.5 w-3.5 shrink-0" />
          <span>إيداع</span>
        </button>
      )}
    </div>
  );
}

/**
 * Touch-friendly symbol selector with larger tap targets.
 */
export function MobileSymbolSelector({
  symbols,
  selected,
  onSelect,
}: {
  symbols: Array<{ symbol: string; bid?: number; ask?: number; change?: number }>;
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="md:hidden overflow-x-auto no-scrollbar">
      <div className="flex gap-1.5 px-2 py-2">
        {symbols.map((s) => (
          <button
            key={s.symbol}
            onClick={() => onSelect(s.symbol)}
            className={cn(
              "shrink-0 px-3 py-2 rounded-xl text-xs transition active:scale-95",
              selected === s.symbol
                ? "bg-violet-600 text-white ring-1 ring-violet-400"
                : "bg-slate-800 text-slate-300 border border-slate-700",
            )}
          >
            <div className="font-semibold">{s.symbol}</div>
            <div className="font-mono mt-0.5 text-[10px] opacity-75">
              {s.bid != null ? s.bid.toFixed(s.bid > 10 ? 2 : 5) : "—"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
