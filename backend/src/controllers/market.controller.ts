import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { getTickerDetail, getTickerNews, getTickerDividend } from "../services/market.service";
import { logger } from "../config/logger";

const TICKER_RE = /^[A-Z]{1,5}$/;

/**
 * Real Massive.com market data for one ticker (free tier: ticker reference,
 * news with sentiment, dividends). Trades/quotes need a paid plan and are
 * honestly not exposed — the response shape reflects exactly what the key
 * unlocks. Auth-gated like every other endpoint.
 */
export async function getTicker(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      res.status(400).json({ error: "Ticker must be 1-5 uppercase letters (e.g. AAPL)." });
      return;
    }
    const [detail, dividend, news] = await Promise.all([
      getTickerDetail(ticker),
      getTickerDividend(ticker),
      getTickerNews(ticker, 6),
    ]);
    if (!detail && !dividend && news.length === 0) {
      res.status(404).json({ error: `No free-tier Massive.com data available for ${ticker}.` });
      return;
    }
    res.json({ ticker, detail, dividend, news });
  } catch (error: any) {
    logger.error("Market ticker error:", error);
    res.status(500).json({ error: error?.message || "Failed to fetch market data" });
  }
}
