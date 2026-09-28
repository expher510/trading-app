import { Router, Request, Response } from "express";

export const marketRouter = Router();

const MT5_BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://186.240.145.87:8008";

// Cache store
const candleCache = new Map<string, { data: any; expiry: number }>();
let tickCache: { data: Record<string, any>; expiry: number } = { data: {}, expiry: 0 };

// Crypto mapping
const CRYPTO_MAP: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  SOLUSD: "SOLUSDT",
  BNBUSD: "BNBUSDT",
  XRPUSD: "XRPUSDT",
  ADAUSD: "ADAUSDT",
};

// Supported Symbols
const SYMBOLS = [
  // Metals & Forex (from MT5)
  {
    id: "XAUUSD",
    name: "XAUUSD",
    displayName: "Gold / USD",
    category: "METALS",
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: -2.5,
    swapShort: 0.5,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "EURUSD",
    name: "EURUSD",
    displayName: "EUR/USD",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: -2.5,
    swapShort: 0.5,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "GBPUSD",
    name: "GBPUSD",
    displayName: "GBP/USD",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: -2.5,
    swapShort: 0.5,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "USDJPY",
    name: "USDJPY",
    displayName: "USD/JPY",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: 0.5,
    swapShort: -2.5,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "AUDUSD",
    name: "AUDUSD",
    displayName: "AUD/USD",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: -2,
    swapShort: 0.3,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "USDCAD",
    name: "USDCAD",
    displayName: "USD/CAD",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: -1.5,
    swapShort: 0.2,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "USDCHF",
    name: "USDCHF",
    displayName: "USD/CHF",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: 0.3,
    swapShort: -2,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "CADJPY",
    name: "CADJPY",
    displayName: "CAD/JPY",
    category: "FOREX",
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 1,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 7,
    swapLong: 0.2,
    swapShort: -1.8,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  // Crypto (from Binance)
  {
    id: "BTCUSD",
    name: "BTCUSD",
    displayName: "Bitcoin",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "ETHUSD",
    name: "ETHUSD",
    displayName: "Ethereum",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "SOLUSD",
    name: "SOLUSD",
    displayName: "Solana",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "BNBUSD",
    name: "BNBUSD",
    displayName: "BNB",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "XRPUSD",
    name: "XRPUSD",
    displayName: "XRP",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.0001,
    tickValue: 0.0001,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
  {
    id: "ADAUSD",
    name: "ADAUSD",
    displayName: "Cardano",
    category: "CRYPTO",
    contractSize: 1,
    tickSize: 0.0001,
    tickValue: 0.0001,
    marginPercent: 1,
    maxLeverage: 100,
    commission: 0,
    swapLong: 0,
    swapShort: 0,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    isActive: true,
  },
];

// Helper: Fetch Binance Candles
async function fetchBinanceCandles(binanceSymbol: string, interval: string, limit: number) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Binance returned ${res.status}`);
  const data = await res.json();
  return data.map((r: any) => ({
    time: Math.floor(r[0] / 1000),
    timestamp: r[0],
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
    volume: parseFloat(r[5]),
  }));
}

// Helper: Fetch MT5 Candles
async function fetchMT5Candles(symbol: string, tf: string, limit: number) {
  const count = Math.min(Math.max(limit || 200, 50), 1000);
  const url = `${MT5_BRIDGE_URL}/candles?symbol=${symbol}&tf=${tf}&count=${count}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`MT5 Bridge returned ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((c: any) => c && typeof c.open === "number" && c.open > 0 && c.close > 0)
    .map((c: any) => ({
      time: c.time,
      timestamp: c.time * 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0,
    }));
}

// Helper: Fetch All Ticks
async function fetchAllTicks(): Promise<Record<string, any>> {
  const now = Date.now();
  if (now < tickCache.expiry && Object.keys(tickCache.data).length > 0) {
    return tickCache.data;
  }

  const result: Record<string, any> = {};

  // 1. Fetch MT5 ticks (Forex & Gold)
  try {
    const mt5Res = await fetch(`${MT5_BRIDGE_URL}/ticks`, { signal: AbortSignal.timeout(3000) });
    if (mt5Res.ok) {
      const mt5Ticks = await mt5Res.json();
      for (const [sym, t] of Object.entries(mt5Ticks as Record<string, any>)) {
        if (t.bid > 0) {
          result[sym] = {
            symbol: sym,
            bid: t.bid,
            ask: t.ask,
            timestamp: t.time * 1000 || now,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("MT5 tick fetch failed:", err.message);
  }

  // 2. Fetch Binance ticks (Crypto)
  try {
    const binanceRes = await fetch("https://api.binance.com/api/v3/ticker/bookTicker", { signal: AbortSignal.timeout(4000) });
    if (binanceRes.ok) {
      const bookTicks = await binanceRes.json();
      const lookup = new Map<string, any>();
      for (const item of bookTicks) {
        lookup.set(item.symbol, item);
      }

      for (const [sym, bPair] of Object.entries(CRYPTO_MAP)) {
        const item = lookup.get(bPair);
        if (item) {
          result[sym] = {
            symbol: sym,
            bid: parseFloat(item.bidPrice),
            ask: parseFloat(item.askPrice),
            timestamp: now,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("Binance tick fetch failed:", err.message);
  }

  if (Object.keys(result).length > 0) {
    tickCache = { data: result, expiry: now + 1000 }; // 1s cache
  }

  return result;
}

// ── GET /api/market-data/symbols ──
marketRouter.get("/symbols", (req: Request, res: Response) => {
  res.json(SYMBOLS);
});

// ── GET /api/market-data/ticks ──
marketRouter.get("/ticks", async (req: Request, res: Response) => {
  const ticks = await fetchAllTicks();
  res.json(ticks);
});

// ── GET /api/market-data/ticks/:symbol ──
marketRouter.get("/ticks/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  const ticks = await fetchAllTicks();
  if (ticks[symbol]) {
    res.json(ticks[symbol]);
  } else {
    res.status(404).json({ error: "Symbol not found or no tick data" });
  }
});

// ── Handler for Candles (both GET and POST supported) ──
async function handleCandlesRequest(req: Request, res: Response) {
  const symbol = req.params.symbol?.toUpperCase() || (req.query.symbol as string)?.toUpperCase();
  const timeframe = (req.body?.timeframe || req.query.timeframe || req.query.tf || "15m") as string;
  const limit = parseInt((req.body?.limit || req.query.limit || "200") as string, 10);

  if (!symbol) {
    return res.status(400).json({ error: "Symbol is required" });
  }

  const cacheKey = `${symbol}_${timeframe}_${limit}`;
  const cached = candleCache.get(cacheKey);
  const now = Date.now();
  if (cached && now < cached.expiry) {
    return res.json({
      candles: cached.data,
      metadata: {
        historicalCoverageStart: cached.data[0]?.time ?? null,
        isPartial: false,
        backfillQueued: false,
      },
    });
  }

  try {
    let candles: any[] = [];
    if (CRYPTO_MAP[symbol]) {
      // Crypto -> Binance
      const binancePair = CRYPTO_MAP[symbol];
      candles = await fetchBinanceCandles(binancePair, timeframe, limit);
    } else {
      // Forex & Metals -> MT5
      candles = await fetchMT5Candles(symbol, timeframe, limit);
    }

    if (candles && candles.length > 0) {
      candleCache.set(cacheKey, { data: candles, expiry: now + 5000 }); // 5s cache
      return res.json({
        candles,
        metadata: {
          historicalCoverageStart: candles[0]?.time ?? null,
          isPartial: false,
          backfillQueued: false,
        },
      });
    }

    // If empty, return cached if available or 404
    if (cached) {
      return res.json({
        candles: cached.data,
        metadata: {
          historicalCoverageStart: cached.data[0]?.time ?? null,
          isPartial: false,
          backfillQueued: false,
        },
      });
    }

    return res.json({
      candles: [],
      metadata: {
        historicalCoverageStart: null,
        isPartial: false,
        backfillQueued: false,
      },
    });
  } catch (err: any) {
    console.error(`Error fetching candles for ${symbol}:`, err.message);
    if (cached) {
      return res.json({
        candles: cached.data,
        metadata: {
          historicalCoverageStart: cached.data[0]?.time ?? null,
          isPartial: false,
          backfillQueued: false,
        },
      });
    }
    return res.status(500).json({ error: "Failed to fetch candles", message: err.message });
  }
}

marketRouter.get("/candles/:symbol", handleCandlesRequest);
marketRouter.post("/candles/:symbol", handleCandlesRequest);
marketRouter.get("/candles", handleCandlesRequest);
marketRouter.post("/candles", handleCandlesRequest);
