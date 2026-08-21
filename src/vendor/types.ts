/**
 * Locally vendored type definitions.
 *
 * Trading MiniApp is standalone, so the type definitions used by
 * the terminal are inlined here.
 */

/** One calendar day's trading summary for a single account. */
export interface DailyPnlEntry {
  date: string;
  netPnl: number;
  realizedPnl: number;
  commission: number;
  tradeCount: number;
  winTrades: number;
  lossTrades: number;
  equity: number;
  isWin: boolean;
}

/** Aggregated summary statistics for a calendar period. */
export interface PnlCalendarSummary {
  totalPnl: number;
  totalTrades: number;
  totalWinTrades: number;
  totalLossTrades: number;
  winDays: number;
  lossDays: number;
  neutralDays: number;
  winRate: number;
  avgWinDay: number;
  avgLossDay: number;
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
  longestWinStreak: number;
  longestLossStreak: number;
  bestTrade: number;
  worstTrade: number;
}

/** Full response shape for daily PnL. */
export interface PnlCalendarResponse {
  days: DailyPnlEntry[];
  byAccount?: Record<string, DailyPnlEntry[]>;
  summary: PnlCalendarSummary;
  period: { from: string; to: string };
}
