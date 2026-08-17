import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  TrendingUp, Search, Loader2, Globe, ExternalLink, Newspaper,
  ArrowRight, Sparkles, AlertTriangle, Building2, Wallet, RefreshCw,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import { getMarketSnapshot, MarketSnapshot, MarketNewsItem } from "@/services/market.service";
import { createResearch, runResearch, ResearchResult } from "@/services/research.service";

const POPULAR = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "NFLX"];

const STAGE_LABEL: Record<string, string> = {
  starting: "Starting research…",
  searching: "Searching the web for real sources…",
  market: "Fetching live market data (Massive.com)…",
  files: "Scanning your files…",
  analyzing: "Reading sources…",
  writing: "Writing the synthesis…",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
  } catch {
    return "";
  }
}

function fmtCap(cap?: number | null): string {
  if (!cap) return "";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap}`;
}

function NewsCard({ item, onOpen }: { item: MarketNewsItem; onOpen?: () => void }) {
  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className={cn("card-surface card-hover group flex flex-col rounded-xl p-4", onOpen && "cursor-pointer lg:cursor-default")}
    >
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{item.publisher || "News"}</span>
        {item.publishedUtc && <span>· {fmtDate(item.publishedUtc)}</span>}
        {item.sentiment && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              item.sentiment === "positive"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : item.sentiment === "negative"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {item.sentiment}
          </span>
        )}
      </p>
      <p className="mt-1.5 line-clamp-3 text-sm font-medium leading-snug">{item.title}</p>
      {item.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>}
      {item.articleUrl && (
        <a
          href={item.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          Open article <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function Markets() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState("");

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [researchId, setResearchId] = useState<string | null>(null);
  const [researchSummary, setResearchSummary] = useState<string>("");
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const reduced = useReducedMotion();
  // Mobile slide-in drawer showing a tapped article's full detail.
  const [newsItem, setNewsItem] = useState<MarketNewsItem | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const fetchTicker = useCallback(async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    if (!/^[A-Z]{1,5}$/.test(t)) {
      setError("Enter a ticker like AAPL or TSLA (1–5 letters).");
      return;
    }
    abortRef.current?.abort();
    setRunning(false);
    setStage("");
    setResearchId(null);
    setResearchSummary("");
    setError("");
    setLoading(true);
    setTicker(t);
    try {
      const data = await getMarketSnapshot(t);
      setSnapshot(data);
    } catch (e: any) {
      setSnapshot(null);
      setError(e?.message || `Could not fetch data for ${t}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runResearchFor = useCallback(async () => {
    if (!snapshot || running) return;
    const t = snapshot.ticker;
    setRunning(true);
    setStage("starting");
    setResearchId(null);
    setResearchSummary("");
    setError("");
    try {
      const session = await createResearch(`Research ${t} — recent news, company fundamentals, and outlook`, "quick");
      setResearchId(session.id);
      abortRef.current = runResearch(session.id, {
        onStage: (st) => setStage(st),
        onDone: (res: ResearchResult) => {
          setResearchSummary(res.summary);
          setRunning(false);
          setStage("");
        },
        onError: (msg) => {
          setError(msg);
          setRunning(false);
          setStage("");
        },
      });
    } catch (e: any) {
      setError(e?.message || "Could not start research.");
      setRunning(false);
      setStage("");
    }
  }, [snapshot, running]);

  const detail = snapshot?.detail || null;
  const dividend = snapshot?.dividend || null;
  const news = snapshot?.news || [];
  const stats: Array<[string, string]> = [];
  if (detail?.primaryExchange) stats.push(["Exchange", detail.primaryExchange]);
  if (detail?.marketCap) stats.push(["Market cap", fmtCap(detail.marketCap)]);
  if (detail?.currencyName) stats.push(["Currency", detail.currencyName]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpatialEnvironment />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pb-8 text-center">
          <NexusCore size={150} active={running || loading} state={running ? "thinking" : loading ? "thinking" : error ? "error" : snapshot ? "success" : "idle"} />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-primary">Markets</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Real Massive.com market data — ticker reference, dividends, and news — with one-click deep research on any stock.
            </p>
          </div>

          {/* Ticker input */}
          <div className="w-full max-w-xl">
            <div className="card-surface rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void fetchTicker(ticker);
                  }}
                  placeholder="Enter a ticker (e.g. AAPL)"
                  aria-label="Ticker symbol"
                  className="min-w-0 flex-1 bg-transparent text-base font-medium uppercase outline-none placeholder:normal-case placeholder:font-normal placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={() => void fetchTicker(ticker)}
                  disabled={!ticker.trim() || loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Look up
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Live trades and quotes need a paid Massive plan — this studio shows the real free-tier data: company reference, dividends, and news.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {POPULAR.map((t) => (
                <button
                  key={t}
                  onClick={() => void fetchTicker(t)}
                  className="rounded-full border border-muted-foreground/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Running state */}
        {running && (
          <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {STAGE_LABEL[stage] || "Researching…"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Real stages from the backend — web search, Massive.com market data, your files, then a cited synthesis.
            </p>
          </div>
        )}

        {/* Quote-style cards */}
        {!loading && snapshot && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Company card */}
              <div className="card-surface relative overflow-hidden rounded-2xl p-5 lg:col-span-2">
                <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/10 blur-2xl" />
                <div className="relative">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> Company
                  </p>
                  <div className="mt-2 flex items-baseline gap-3">
                    <h2 className="font-display text-3xl font-bold tracking-tight">{snapshot.ticker}</h2>
                    {detail?.name && <p className="text-lg font-medium text-muted-foreground">{detail.name}</p>}
                  </div>
                  {stats.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {stats.map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {detail?.description && (
                    <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
                  )}
                  {detail?.homepageUrl && (
                    <a
                      href={detail.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {detail.homepageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {!detail && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No ticker reference available for {snapshot.ticker} on the free tier.
                    </p>
                  )}
                </div>
              </div>

              {/* Dividend card */}
              <div className="card-surface rounded-2xl p-5">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Dividend
                </p>
                {dividend ? (
                  <>
                    <p className="mt-2 font-display text-3xl font-bold tracking-tight">
                      {dividend.cashAmount !== undefined && dividend.cashAmount !== null ? `$${dividend.cashAmount}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">per share</p>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      {dividend.exDividendDate && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Ex-date</dt>
                          <dd className="font-medium">{fmtDate(dividend.exDividendDate)}</dd>
                        </div>
                      )}
                      {dividend.payDate && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Pay date</dt>
                          <dd className="font-medium">{fmtDate(dividend.payDate)}</dd>
                        </div>
                      )}
                      {dividend.dividendType && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Type</dt>
                          <dd className="font-medium capitalize">{dividend.dividendType}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No dividend record available for {snapshot.ticker} on the free tier.</p>
                )}
              </div>
            </div>

            {/* Research CTA */}
            <div className="card-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Deep research on {snapshot.ticker}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Search the web, your files, and live Massive.com data — synthesized with citations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {researchSummary && researchId && (
                  <Link
                    to={`/research/${researchId}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                  >
                    Open full report <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  onClick={() => void runResearchFor()}
                  disabled={running}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {running ? "Researching…" : researchSummary ? "Rerun research" : "Run research"}
                </button>
              </div>
            </div>

            {/* Research summary result */}
            {researchSummary && !running && (
              <div className="card-surface rounded-2xl p-5">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Research summary
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{researchSummary}</p>
              </div>
            )}

            {/* News */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Newspaper className="h-4 w-4" /> Latest news · {news.length} real items
              </h2>
              {news.length === 0 ? (
                <p className="text-sm text-muted-foreground">No free-tier news available for {snapshot.ticker}.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((n, i) => (
                    <NewsCard key={i} item={n} onOpen={() => setNewsItem(n)} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!loading && !snapshot && !error && (
          <EmptyState
            icon={Globe}
            title="Look up a ticker"
            description="Enter a stock ticker above — see the real company reference, dividend record, and latest news, then run one-click deep research."
            className="py-16"
          />
        )}
      </div>

      {/* Mobile — tapped article opens in a slide-in drawer (desktop keeps the
          grid + hover-revealed "Open article" links). */}
      <MobileDrawer
        open={!!newsItem}
        onClose={() => setNewsItem(null)}
        title="Article"
        side="right"
        panelClassName="w-full max-w-md"
        icon={<Newspaper className="h-4 w-4" />}
      >
        {newsItem && (
          <div className="p-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{newsItem.publisher || "News"}</span>
              {newsItem.publishedUtc && <span>· {fmtDate(newsItem.publishedUtc)}</span>}
              {newsItem.sentiment && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    newsItem.sentiment === "positive"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : newsItem.sentiment === "negative"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {newsItem.sentiment}
                </span>
              )}
            </p>
            <h3 className="mt-2 text-base font-semibold leading-snug">{newsItem.title}</h3>
            {newsItem.summary && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{newsItem.summary}</p>
            )}
            {newsItem.articleUrl && (
              <a
                href={newsItem.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Open article <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </MobileDrawer>
    </div>
  );
}
