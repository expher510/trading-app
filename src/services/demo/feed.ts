import { publish } from "./bus.ts";
import { getSeedPrice } from "./candles.ts";
import { mark } from "./engine.ts";
import { DEMO_SYMBOLS } from "./instruments.ts";

/**
 * Live market-data feed simulator.
 *
 * Generates continuous, smooth real-time ticks starting from the real market price,
 * ensuring zero abrupt jumps, realistic micro-volatility, and smooth chart rendering.
 */

const TICK_MS = 600;

type SymbolCursor = {
  symbol: string;
  basePrice: number;
  currentPrice: number;
  spread: number;
  tickSize: number;
  volatility: number;
};

let timer: ReturnType<typeof setInterval> | null = null;
let cursors: SymbolCursor[] = [];

function getSymbolVolatility(symbol: string, basePrice: number): number {
  if (symbol.startsWith("BTC")) return 1.5; // BTC: ~$1-2 per tick
  if (symbol.startsWith("ETH")) return 0.15; // ETH: ~$0.1-0.2
  if (symbol.startsWith("SOL")) return 0.03; // SOL: ~$0.03
  if (symbol.startsWith("XAU")) return 0.15; // Gold: ~$0.15
  if (symbol.includes("JPY")) return 0.005; // USDJPY: ~0.005
  // EURUSD, GBPUSD: ~0.00003 (0.3 pip)
  return Math.max(0.00003, basePrice * 0.00003);
}

function defaultSeedPrice(symbol: string): number {
  if (symbol.startsWith("EUR")) return 1.135;
  if (symbol.startsWith("GBP")) return 1.305;
  if (symbol.includes("JPY")) return 155.0;
  if (symbol.startsWith("XAU")) return 2700.0;
  if (symbol.startsWith("BTC")) return 65000.0;
  if (symbol.startsWith("ETH")) return 2500.0;
  if (symbol.startsWith("SOL")) return 150.0;
  if (symbol.startsWith("BNB")) return 580.0;
  if (symbol.startsWith("XRP")) return 0.55;
  if (symbol.startsWith("ADA")) return 0.35;
  return 100;
}

function buildCursors(): SymbolCursor[] {
  return DEMO_SYMBOLS.map((s) => {
    const seed = getSeedPrice(s.name) || defaultSeedPrice(s.name);
    const spread = Math.max(s.tickSize, seed * 0.0001);
    const volatility = getSymbolVolatility(s.name, seed);
    return {
      symbol: s.name,
      basePrice: seed,
      currentPrice: seed,
      spread,
      tickSize: s.tickSize,
      volatility,
    };
  });
}

function emitTick(cursor: SymbolCursor): void {
  // Smooth random walk with gentle mean-reversion towards basePrice
  const drift = (cursor.basePrice - cursor.currentPrice) * 0.02;
  const shock = (Math.random() - 0.499) * cursor.volatility;
  cursor.currentPrice += drift + shock;

  const price = cursor.currentPrice;
  const half = cursor.spread / 2;

  publish("market-data", {
    eventType: "MarketTick",
    symbol: cursor.symbol,
    bid: price - half,
    ask: price + half,
    occurredAt: Date.now(),
  });

  mark(cursor.symbol, price);
}

let liveSyncTimer: ReturnType<typeof setInterval> | null = null;

async function syncLiveTicks(): Promise<void> {
  try {
    const res = await fetch("/api/market-data/ticks");
    if (!res.ok) return;
    const ticks = await res.json();
    for (const [sym, t] of Object.entries(ticks as Record<string, any>)) {
      if (t && t.bid > 0) {
        const cursor = cursors.find((c) => c.symbol === sym);
        const mid = (t.bid + t.ask) / 2;
        if (cursor) {
          cursor.basePrice = mid;
          cursor.currentPrice = mid;
          cursor.spread = Math.abs(t.ask - t.bid) || cursor.spread;
        }
        publish("market-data", {
          eventType: "MarketTick",
          symbol: sym,
          bid: t.bid,
          ask: t.ask,
          occurredAt: Date.now(),
        });
        mark(sym, mid);
      }
    }
  } catch {
    // Gentle fallback
  }
}

export function startDemoFeed(): void {
  if (timer) return;
  cursors = buildCursors();
  // Seed initial price for every symbol immediately
  for (const c of cursors) emitTick(c);
  // Fetch real live ticks right away
  syncLiveTicks();

  timer = setInterval(() => {
    for (const c of cursors) emitTick(c);
  }, TICK_MS);

  // Poll live MT5 & Binance ticks every 1000ms
  liveSyncTimer = setInterval(() => {
    syncLiveTicks();
  }, 1000);
}

export function stopDemoFeed(): void {
  if (timer) clearInterval(timer);
  if (liveSyncTimer) clearInterval(liveSyncTimer);
  timer = null;
  liveSyncTimer = null;
}
