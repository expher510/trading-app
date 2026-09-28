"""
FXENGIN - 24/7 VPS Native MetaTrader 5 Mirror Daemon & Market Data HTTP Bridge
Runs inside Wine Python on Hostinger VPS completely independent of user's PC.
Synchronizes mobile trades from account 8058543 (SCFMLimited-Demo2) in real-time (<1s latency).
Uses investor password W!TxHdL4 (read-only, strictly zero auto-trading).
Now includes ultra-fast HTTP Bridge on port 8008 for Trading Terminal charts & live ticks.
"""

import sys
import time
import json
import logging
import socket
import threading
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timedelta, timezone
import httpx

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Socket safety
socket.setdefaulttimeout(10.0)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("vps_mirror_daemon")

VPS_SYNC_URL = "http://127.0.0.1:8000/api/v1/mirror/sync"
MIRROR_TOKEN = "fx_mirror_sec_2026_ab81c"
MT5_PATH = r"C:\Program Files\MetaTrader 5\terminal64.exe"
MT5_LOGIN = 8058543
MT5_PASSWORD = "W!TxHdL4"  # Investor password (read-only)
MT5_SERVER = "SCFMLimited-Demo2"

def clean_symbol(symbol: str) -> str:
    if not symbol:
        return ""
    return symbol.split(".")[0].upper()

def get_symbol_digits(sym: str) -> int:
    sym = (sym or "").upper()
    if "JPY" in sym:
        return 3
    if any(k in sym for k in ["XAU", "GOLD", "XAG", "BTC", "OIL"]):
        return 2
    if any(k in sym for k in ["US30", "NAS100", "SPX500", "GER30", "UK100"]):
        return 0
    return 5

def get_symbol_point(sym: str) -> float:
    d = get_symbol_digits(sym)
    return round(10.0 ** (-d), d)

def resolve_broker_symbol(sym: str) -> str:
    sym = (sym or "").upper()
    if mt5 is None:
        return sym
    if mt5.symbol_info(sym):
        return sym
    if mt5.symbol_info(f"{sym}.r"):
        return f"{sym}.r"
    if mt5.symbol_info(f"{sym}.pro"):
        return f"{sym}.pro"
    return sym

def ensure_mt5_connected():
    if mt5 is None:
        logger.error("MetaTrader5 package not available in Wine Python.")
        return None

    try:
        acc = mt5.account_info()
        term = mt5.terminal_info()
        if acc and term and term.connected:
            return acc
    except Exception:
        pass

    logger.info(f"Connecting to MT5 terminal #{MT5_LOGIN} on {MT5_SERVER}...")
    try:
        mt5.shutdown()
    except Exception:
        pass

    for attempt in range(1, 15):
        try:
            ok = mt5.initialize(
                path=MT5_PATH,
                login=MT5_LOGIN,
                password=MT5_PASSWORD,
                server=MT5_SERVER,
                timeout=60000
            )
            if ok:
                acc = mt5.account_info()
                term = mt5.terminal_info()
                if acc and term and term.connected:
                    logger.info(f"✅ Connected to MT5: #{acc.login} ({acc.server}) - Balance: ${acc.balance:.2f} | TradeMode: {acc.trade_mode}")
                    return acc
            logger.warning(f"MT5 initialize returned False ({mt5.last_error()}). Attempt {attempt}/15, retrying in 3s...")
        except Exception as e:
            logger.warning(f"Exception connecting to MT5: {e}. Attempt {attempt}/15, retrying in 3s...")
        time.sleep(3)

    return None

# =====================================================================
# HTTP Bridge Server (Port 8008) for Trading Terminal Data
# =====================================================================
TF_MAP = {}
if mt5 is not None:
    TF_MAP = {
        "1m": mt5.TIMEFRAME_M1,
        "5m": mt5.TIMEFRAME_M5,
        "15m": mt5.TIMEFRAME_M15,
        "30m": mt5.TIMEFRAME_M30,
        "1h": mt5.TIMEFRAME_H1,
        "4h": mt5.TIMEFRAME_H4,
        "1d": mt5.TIMEFRAME_D1,
        "1w": mt5.TIMEFRAME_W1,
    }

class MT5MarketHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Quiet logger to avoid terminal clutter

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"MT5 Market Data Bridge"}')
            return

        if parsed.path == "/symbols":
            symbols = []
            if mt5 is not None:
                for s in (mt5.symbols_get() or []):
                    clean = clean_symbol(s.name)
                    symbols.append({
                        "name": clean,
                        "rawName": s.name,
                        "digits": s.digits,
                        "point": s.point,
                        "spread": s.spread,
                    })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(symbols).encode("utf-8"))
            return

        if parsed.path == "/ticks":
            tracked = [
                "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD",
                "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "CADJPY"
            ]
            ticks = {}
            if mt5 is not None:
                for sym in tracked:
                    broker_sym = resolve_broker_symbol(sym)
                    mt5.symbol_select(broker_sym, True)
                    t = mt5.symbol_info_tick(broker_sym)
                    if t:
                        ticks[sym] = {
                            "symbol": sym,
                            "bid": float(t.bid),
                            "ask": float(t.ask),
                            "time": int(t.time),
                            "spread": round(float(t.ask - t.bid), 5),
                        }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(ticks).encode("utf-8"))
            return

        if parsed.path == "/candles":
            sym = params.get("symbol", ["XAUUSD"])[0].upper()
            tf_str = params.get("tf", ["15m"])[0].lower()
            count = int(params.get("count", [200])[0])

            tf_const = TF_MAP.get(tf_str, getattr(mt5, "TIMEFRAME_M15", 15))
            broker_sym = resolve_broker_symbol(sym)

            candles = []
            if mt5 is not None:
                mt5.symbol_select(broker_sym, True)
                rates = mt5.copy_rates_from_pos(broker_sym, tf_const, 0, count)
                if rates is not None and len(rates) > 0:
                    for r in rates:
                        candles.append({
                            "time": int(r[0]),
                            "open": float(r[1]),
                            "high": float(r[2]),
                            "low": float(r[3]),
                            "close": float(r[4]),
                            "volume": float(r[5])
                        })

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(candles).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def start_http_server():
    try:
        server = HTTPServer(("0.0.0.0", 8008), MT5MarketHandler)
        logger.info("📡 [HTTP BRIDGE] MT5 Market Data Server active on 0.0.0.0:8008")
        server.serve_forever()
    except Exception as e:
        logger.error(f"❌ Failed to run HTTP bridge server: {e}")

# =====================================================================
# Main Synchronization Loop
# =====================================================================
def run_sync_loop():
    logger.info("🚀 Starting FXENGIN 24/7 VPS Native Mirror Daemon...")
    acc = ensure_mt5_connected()
    if not acc:
        logger.error("Fatal: Could not initialize MT5. Exiting.")
        sys.exit(1)

    # Start HTTP Bridge in a background daemon thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()

    client_timeout = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=5.0)
    client = httpx.Client(timeout=client_timeout)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MIRROR_TOKEN}",
        "User-Agent": "FXENGIN-VPS-Mirror-Daemon/24-7"
    }

    last_heartbeat_ts = 0.0
    last_known_positions = {}
    consecutive_errors = 0

    logger.info("🟢 VPS Mirror Daemon is active and streaming to localhost:8000 every 1.0s.")

    while True:
        try:
            now = time.time()

            # Ensure MT5 is healthy
            try:
                acc = mt5.account_info()
            except Exception:
                acc = None

            if not acc:
                logger.warning("MT5 account disconnected. Reconnecting...")
                acc = ensure_mt5_connected()
                if not acc:
                    time.sleep(3)
                    continue

            # 1. Fetch current open positions
            positions = mt5.positions_get()
            pos_data = []
            current_tickets = set()

            for p in (positions or []):
                sym = clean_symbol(p.symbol)
                digits = get_symbol_digits(sym)
                point = get_symbol_point(sym)
                current_tickets.add(int(p.ticket))
                pos_data.append({
                    "ticket": int(p.ticket),
                    "symbol": sym,
                    "direction": "BUY" if p.type == 0 else "SELL",
                    "lots": float(p.volume),
                    "price_open": float(p.price_open),
                    "sl": float(p.sl) if p.sl else 0.0,
                    "tp": float(p.tp) if p.tp else 0.0,
                    "digits": digits,
                    "point": point
                })

            # Check if positions changed (new, modified, or closed)
            pos_dict_repr = {p["ticket"]: (p["sl"], p["tp"], p["lots"]) for p in pos_data}
            positions_changed = (pos_dict_repr != last_known_positions)
            if positions_changed:
                logger.info(f"⚡ [POSITION CHANGE] Open count: {len(pos_data)} (Tickets: {list(pos_dict_repr.keys())})")
                last_known_positions = pos_dict_repr

            # 2. Fetch closed deals (last 24 hours)
            now_utc = datetime.now(timezone.utc)
            deals = mt5.history_deals_get(now_utc - timedelta(days=1), now_utc + timedelta(days=1))
            deals_data = []
            for d in (deals or []):
                if d.entry in [mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT] or (d.profit != 0 and d.entry != mt5.DEAL_ENTRY_IN):
                    deals_data.append({
                        "ticket": int(d.ticket),
                        "position_id": int(d.position_id),
                        "symbol": clean_symbol(d.symbol),
                        "profit": float(d.profit),
                        "volume": float(d.volume),
                        "entry": int(d.entry),
                        "time": int(d.time)
                    })

            # 3. Fetch latest candles for active symbols (for trade cards)
            candles_data = {}
            active_symbols = set([p["symbol"] for p in pos_data])
            # Always track Gold + Major FX
            for s in list(active_symbols) + ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY"]:
                try:
                    s_to_query = resolve_broker_symbol(s)
                    rates = mt5.copy_rates_from_pos(s_to_query, getattr(mt5, "TIMEFRAME_M5", 5), 0, 100)
                    if rates is not None and len(rates) > 0:
                        candles_data[s] = [
                            {
                                "time": int(r[0]),
                                "open": float(r[1]),
                                "high": float(r[2]),
                                "low": float(r[3]),
                                "close": float(r[4]),
                                "volume": float(r[5])
                            }
                            for r in rates
                        ]
                except Exception:
                    pass

            # 4. Construct payload
            payload = {
                "account_info": {
                    "login": int(acc.login),
                    "server": str(acc.server),
                    "balance": float(acc.balance),
                    "equity": float(acc.equity),
                    "trade_mode": int(acc.trade_mode)
                },
                "positions": pos_data,
                "deals": deals_data,
                "candles": candles_data,
                "timestamp": now
            }

            # 5. Send to VPS backend
            resp = client.post(VPS_SYNC_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                consecutive_errors = 0
                if now - last_heartbeat_ts >= 30.0:
                    last_heartbeat_ts = now
                    logger.info(
                        f"💓 [VPS 24/7 HEARTBEAT] Synced #{acc.login} | "
                        f"Balance: ${acc.balance:.2f} | Open: {len(pos_data)} | "
                        f"Closed(24h): {len(deals_data)} | HTTP 200 OK"
                    )
            else:
                logger.warning(f"⚠️ VPS sync returned HTTP {resp.status_code}: {resp.text[:150]}")

        except httpx.RequestError as e:
            consecutive_errors += 1
            if consecutive_errors % 10 == 1:
                logger.warning(f"⚠️ HTTP connection error to VPS backend: {e}")
        except Exception as e:
            logger.error(f"❌ Unexpected error in sync loop: {e}", exc_info=True)

        time.sleep(1.0)

if __name__ == "__main__":
    run_sync_loop()
