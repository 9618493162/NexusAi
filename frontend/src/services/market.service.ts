import { useAuthStore } from "@/store/auth.store";

export interface MarketTickerDetail {
  ticker: string;
  name: string;
  description?: string | null;
  marketCap?: number | null;
  currencyName?: string | null;
  primaryExchange?: string | null;
  active?: boolean | null;
  homepageUrl?: string | null;
}

export interface MarketNewsItem {
  title: string;
  summary?: string | null;
  sentiment?: string | null;
  articleUrl?: string | null;
  publisher?: string | null;
  publishedUtc?: string | null;
  tickers?: string[] | null;
}

export interface MarketDividend {
  ticker: string;
  cashAmount?: number | null;
  exDividendDate?: string | null;
  payDate?: string | null;
  recordDate?: string | null;
  dividendType?: string | null;
}

export interface MarketSnapshot {
  ticker: string;
  detail: MarketTickerDetail | null;
  dividend: MarketDividend | null;
  news: MarketNewsItem[];
}

const BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/market`;

export async function getMarketSnapshot(ticker: string): Promise<MarketSnapshot> {
  const token = useAuthStore.getState().accessToken || "";
  const res = await fetch(`${BASE}/${encodeURIComponent(ticker.trim().toUpperCase())}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return res.json();
}
