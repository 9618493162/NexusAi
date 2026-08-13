import { env } from "../config/env";
import { logger } from "../config/logger";

/**
 * Massive.com US stock-market data — the free tier that the provided key
 * actually unlocks: ticker reference, news (with summaries/sentiment), and
 * dividends. Trades/quotes/aggregates require a paid plan and are honestly
 * NOT exposed. The key stays server-side in the backend .env.
 */

const BASE = "https://api.massive.com/v3";
const BASE_V2 = "https://api.massive.com/v2";

export interface MarketTicker {
  ticker: string;
  name: string;
  description?: string;
  marketCap?: number;
  currencyName?: string;
  primaryExchange?: string;
  active?: boolean;
  homepageUrl?: string;
}

export interface MarketNewsItem {
  title: string;
  summary?: string;
  sentiment?: string;
  articleUrl?: string;
  publisher?: string;
  publishedUtc?: string;
  tickers?: string[];
}

export interface MarketDividend {
  ticker: string;
  cashAmount?: number;
  exDividendDate?: string;
  payDate?: string;
  recordDate?: string;
  dividendType?: string;
}

export interface MarketDividendHistoryItem extends MarketDividend {
  declarationDate?: string | null;
  frequency?: number | null;
  currency?: string | null;
}

function key(): string | null {
  return env.MASSIVE_API_KEY || null;
}

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T | null> {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${k}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // NOT_AUTHORIZED = the plan doesn't include this dataset — skip it.
      if (body.includes("NOT_AUTHORIZED")) return null;
      logger.warn(`Massive ${url} failed (HTTP ${res.status})`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    logger.warn("Massive request error:", error);
    return null;
  }
}

/** Ticker reference — real company name + description + market cap. */
export async function getTickerDetail(ticker: string): Promise<MarketTicker | null> {
  const data = await getJson<{ results?: Partial<MarketTicker> }>(
    `${BASE}/reference/tickers/${encodeURIComponent(ticker.toUpperCase())}`
  );
  if (!data?.results) return null;
  return {
    ticker: String(data.results.ticker || ticker).toUpperCase(),
    name: String(data.results.name || ticker),
    description: data.results.description,
    marketCap: data.results.marketCap,
    currencyName: data.results.currencyName,
    primaryExchange: data.results.primaryExchange,
    active: data.results.active,
    homepageUrl: data.results.homepageUrl,
  };
}

/** Recent news for a ticker with summaries + sentiment. */
export async function getTickerNews(ticker: string, limit = 4): Promise<MarketNewsItem[]> {
  const data = await getJson<{ results?: Array<{
    title?: string; summary?: string; description?: string; sentiment?: string; article_url?: string;
    published_utc?: string; publisher?: { name?: string }; tickers?: string[];
  }> }>(
    `${BASE_V2}/reference/news?ticker=${encodeURIComponent(ticker.toUpperCase())}&limit=${limit}`
  );
  if (!data?.results?.length) return [];
  return data.results
    .filter((r) => r.title)
    .map((r) => ({
      title: String(r.title),
      // The free tier exposes the article body as `description` — surface it
      // as the summary so sentiment analysis has real content to reason over.
      summary: r.summary || r.description,
      sentiment: r.sentiment,
      articleUrl: r.article_url,
      publisher: r.publisher?.name,
      publishedUtc: r.published_utc,
      tickers: r.tickers,
    }));
}

/** Real dividend history — the free tier returns multiple records. */
export async function getTickerDividendHistory(ticker: string, limit = 24): Promise<MarketDividendHistoryItem[]> {
  const data = await getJson<{ results?: Array<{
    cash_amount?: number;
    ex_dividend_date?: string;
    pay_date?: string;
    record_date?: string;
    declaration_date?: string;
    dividend_type?: string;
    frequency?: number;
    currency?: string;
  }> }>(
    `${BASE}/reference/dividends?ticker=${encodeURIComponent(ticker.toUpperCase())}&limit=${limit}`
  );
  if (!data?.results?.length) return [];
  return data.results.map((r) => ({
    ticker: ticker.toUpperCase(),
    cashAmount: r.cash_amount,
    exDividendDate: r.ex_dividend_date,
    payDate: r.pay_date,
    recordDate: r.record_date,
    declarationDate: r.declaration_date,
    dividendType: r.dividend_type,
    frequency: r.frequency,
    currency: r.currency,
  }));
}

/** Latest dividend record for a ticker. */
export async function getTickerDividend(ticker: string): Promise<MarketDividend | null> {
  const data = await getJson<{ results?: Array<{
    cash_amount?: number; ex_dividend_date?: string; pay_date?: string;
    record_date?: string; dividend_type?: string;
  }> }>(
    `${BASE}/reference/dividends?ticker=${encodeURIComponent(ticker.toUpperCase())}&limit=1`
  );
  const r = data?.results?.[0];
  if (!r) return null;
  return {
    ticker: ticker.toUpperCase(),
    cashAmount: r.cash_amount,
    exDividendDate: r.ex_dividend_date,
    payDate: r.pay_date,
    recordDate: r.record_date,
    dividendType: r.dividend_type,
  };
}

/**
 * Real market research for the tickers found in a query. Returns the fetched
 * facts formatted for the AI plus the raw structured data (for sources).
 */
export async function researchMarket(
  query: string,
  tickers: string[]
): Promise<{
  context: string;
  news: MarketNewsItem[];
  tickers: MarketTicker[];
  dividends: MarketDividend[];
}> {
  const news: MarketNewsItem[] = [];
  const details: MarketTicker[] = [];
  const dividends: MarketDividend[] = [];
  const lines: string[] = [];

  for (const t of tickers.slice(0, 4)) {
    const detail = await getTickerDetail(t);
    if (detail) {
      details.push(detail);
      lines.push(
        `TICKER ${t}: ${detail.name}${detail.primaryExchange ? ` (${detail.primaryExchange})` : ""}` +
          (detail.marketCap ? `, market cap $${(detail.marketCap / 1e12).toFixed(2)}T` : "") +
          (detail.description ? ` — ${detail.description.slice(0, 200)}` : "")
      );
    }
    const d = await getTickerDividend(t);
    if (d && d.cashAmount !== undefined) {
      dividends.push(d);
      lines.push(
        `DIVIDEND ${t}: $${d.cashAmount} per share (ex-date ${d.exDividendDate || "n/a"}, pay ${d.payDate || "n/a"})`
      );
    }
    const n = await getTickerNews(t, 4);
    if (n.length) {
      news.push(...n);
      for (const item of n.slice(0, 3)) {
        lines.push(
          `NEWS ${t}: ${item.title}${item.publisher ? ` (${item.publisher})` : ""}` +
            (item.sentiment ? ` [sentiment: ${item.sentiment}]` : "") +
            (item.summary ? ` — ${item.summary.slice(0, 240)}` : "") +
            (item.articleUrl ? ` ${item.articleUrl}` : "")
        );
      }
    }
    if (!detail && !d && !n.length) {
      lines.push(`TICKER ${t}: no free-tier market data available (trades/quotes require a paid Massive plan).`);
    }
  }

  return {
    context: [
      `MASSIVE.COM MARKET DATA for "${query}" (real, free-tier: ticker reference, news, dividends):`,
      ...lines,
    ].join("\n"),
    news,
    tickers: details,
    dividends,
  };
}

/** Naive but strict ticker detection: 1-5 uppercase letters, optionally $ or company suffix. */
export function detectTickers(query: string): string[] {
  const candidates: string[] = [];
  const re = /(?:\$|\b)([A-Z]{1,5})(?:\b|\.)/g;
  let m: RegExpExecArray | null;
  const banned = new Set([
    "AI", "I", "A", "AN", "IS", "THE", "OF", "AND", "TO", "FOR", "IN", "ON", "WITH",
    "ARE", "IT", "AS", "AT", "BY", "BE", "OR", "NOT", "MAY", "JAN", "FEB", "MAR", "APR",
    "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "USD", "USD ", "GDP", "REPORT",
    "DATA", "2026", "TSLAX", "EDUCATION",
  ]);
  while ((m = re.exec(query)) !== null) {
    const t = m[1].toUpperCase();
    if (t.length < 2) continue;
    if (banned.has(t)) continue;
    if (!candidates.includes(t)) candidates.push(t);
  }
  return candidates.slice(0, 5);
}
