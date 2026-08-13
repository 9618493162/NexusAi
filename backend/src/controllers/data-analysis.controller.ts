import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import {
  loadDataset,
  askDataset,
  askMarketDataset,
  exportCsv,
  buildRowsOverview,
  DatasetOverview,
  detectFormat,
} from "../services/data-analysis.service";
import { getTickerDividendHistory, getTickerNews } from "../services/market.service";

/** Structured formats the Data Lab supports for real analysis. */
const DATA_FORMATS = [".csv", ".tsv", ".json", ".jsonl", ".xlsx", ".xls"];
const TICKER_RE = /^[A-Z]{1,5}$/;

/** List the user's uploaded files that the Data Lab can actually analyze. */
export async function listFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const files = await prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        extractedText: true,
      },
    });
    const analyzable = files
      .map((f) => {
        const format = detectFormat(f.originalName || "", f.mimeType);
        const ext = (f.originalName || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
        return {
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: f.createdAt,
          format,
          analyzable: DATA_FORMATS.includes(ext) || format === "xlsx",
          hasExtractedText: !!f.extractedText,
        };
      })
      .filter((f) => f.analyzable);
    res.json(analyzable);
  } catch (error: any) {
    logger.error("Data-lab list error:", error);
    res.status(500).json({ error: error.message || "Could not list files" });
  }
}

/** Parse a dataset and return the REAL overview (stats, types, preview). */
export async function analyze(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const fileId = String(req.params.id || "");
    if (!fileId) {
      res.status(400).json({ error: "Missing file id" });
      return;
    }
    const { overview } = await loadDataset(userId, fileId);
    res.json(overview);
  } catch (error: any) {
    logger.error("Data-lab analyze error:", error);
    const status = /not found|don't have access/i.test(error?.message || "") ? 404 : 400;
    res.status(status).json({ error: error?.message || "Could not analyze this file" });
  }
}

/** Stream a natural-language answer about the dataset through the real AI pipeline. */
export async function ask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const fileId = String(req.params.id || "");
  const question = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!fileId || !question) {
    res.status(400).json({ error: "Missing file id or question" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { stage: "loading" });

  try {
    send("status", { stage: "analyzing" });
    for await (const chunk of askDataset(userId, fileId, question)) {
      send("chunk", { text: chunk });
    }
    send("done", {});
  } catch (error: any) {
    logger.error("Data-lab ask error:", error);
    send("error", { message: error?.message || "Analysis failed" });
  } finally {
    res.end();
  }
}

/** Build a real dividend-history dataset from Massive.com for a ticker. */
function dividendDataset(ticker: string, history: Awaited<ReturnType<typeof getTickerDividendHistory>>): {
  overview: DatasetOverview;
  rows: Record<string, string | number | boolean | null>[];
} {
  const rows: Record<string, string | number | boolean | null>[] = history.map((d) => ({
    "Ex date": d.exDividendDate || null,
    "Pay date": d.payDate || null,
    "Record date": d.recordDate || null,
    "Declaration date": d.declarationDate || null,
    "Amount ($)": typeof d.cashAmount === "number" ? d.cashAmount : null,
    Type: d.dividendType || null,
    Frequency: typeof d.frequency === "number" ? d.frequency : null,
    Currency: d.currency || null,
  }));
  const overview = buildRowsOverview({
    fileId: `market:${ticker}:dividends`,
    originalName: `${ticker} dividend history`,
    mimeType: "application/json",
    size: rows.length,
    format: "json",
    rows,
    notes: ["Dividend history fetched live from Massive.com (real free-tier data)."],
  });
  return { overview, rows };
}

/** Build a real news-sentiment dataset from Massive.com for a ticker. */
function newsDataset(ticker: string, news: Awaited<ReturnType<typeof getTickerNews>>): {
  overview: DatasetOverview;
  rows: Record<string, string | number | boolean | null>[];
} {
  const rows: Record<string, string | number | boolean | null>[] = news.map((n) => ({
    Date: n.publishedUtc ? String(n.publishedUtc).slice(0, 10) : null,
    Sentiment: n.sentiment || null,
    Publisher: n.publisher || null,
    Title: n.title || null,
    Summary: n.summary || null,
  }));
  const overview = buildRowsOverview({
    fileId: `market:${ticker}:news`,
    originalName: `${ticker} news sentiment`,
    mimeType: "application/json",
    size: rows.length,
    format: "json",
    rows,
    notes: ["News fetched live from Massive.com with real sentiment labels (free tier)."],
  });
  return { overview, rows };
}

/** Real Massive.com market dataset for the Data Lab — dividend history + news sentiment. */
export async function analyzeMarket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      res.status(400).json({ error: "Ticker must be 1-5 uppercase letters (e.g. AAPL)." });
      return;
    }
    const [history, news] = await Promise.all([
      getTickerDividendHistory(ticker, 24),
      getTickerNews(ticker, 12),
    ]);
    if (history.length === 0 && news.length === 0) {
      res.status(404).json({ error: `No free-tier Massive.com data available for ${ticker}.` });
      return;
    }
    const dividends = dividendDataset(ticker, history);
    const newsSet = newsDataset(ticker, news);
    res.json({
      ticker,
      kind: "market",
      fetchedAt: new Date().toISOString(),
      dividends: dividends.overview,
      news: newsSet.overview,
    });
  } catch (error: any) {
    logger.error("Data-lab market analyze error:", error);
    res.status(500).json({ error: error?.message || "Could not load market dataset" });
  }
}

/** Stream a natural-language answer about the market dataset through the real AI pipeline. */
export async function askMarket(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const ticker = String(req.params.ticker || "").trim().toUpperCase();
  const question = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!TICKER_RE.test(ticker) || !question) {
    res.status(400).json({ error: "Missing ticker or question" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { stage: "loading" });

  try {
    send("status", { stage: "analyzing" });
    const [history, news] = await Promise.all([
      getTickerDividendHistory(ticker, 24),
      getTickerNews(ticker, 12),
    ]);
    if (history.length === 0 && news.length === 0) {
      send("error", { message: `No free-tier Massive.com data available for ${ticker}.` });
      res.end();
      return;
    }
    const dividends = dividendDataset(ticker, history);
    const newsSet = newsDataset(ticker, news);
    for await (const chunk of askMarketDataset(
      userId,
      question,
      dividends.overview,
      dividends.rows,
      newsSet.overview,
      newsSet.rows
    )) {
      send("chunk", { text: chunk });
    }
    send("done", {});
  } catch (error: any) {
    logger.error("Data-lab market ask error:", error);
    send("error", { message: error?.message || "Analysis failed" });
  } finally {
    res.end();
  }
}

/** Download the market dataset as a real server-generated CSV. */
export async function downloadMarketCsv(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ticker = String(req.params.ticker || "").trim().toUpperCase();
    const table = String(req.query.table || "dividends");
    if (!TICKER_RE.test(ticker) || (table !== "dividends" && table !== "news")) {
      res.status(400).json({ error: "Invalid ticker or table (dividends | news)" });
      return;
    }
    const [history, news] = await Promise.all([
      getTickerDividendHistory(ticker, 24),
      getTickerNews(ticker, 12),
    ]);
    const { overview, rows } = table === "dividends" ? dividendDataset(ticker, history) : newsDataset(ticker, news);
    const esc = (v: string | number | boolean | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      overview.columnNames.join(","),
      ...rows.map((r) => overview.columnNames.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ticker}_${table}.csv"`);
    res.send(csv);
  } catch (error: any) {
    logger.error("Data-lab market export error:", error);
    res.status(400).json({ error: error?.message || "Could not export this dataset" });
  }
}

/** Download the dataset as a real server-generated CSV. */
export async function downloadCsv(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const fileId = String(req.params.id || "");
    const result = await exportCsv(userId, fileId);
    if (!result) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(result.filename)}"`);
    res.send(result.csv);
  } catch (error: any) {
    logger.error("Data-lab export error:", error);
    res.status(400).json({ error: error?.message || "Could not export this file" });
  }
}

export type { DatasetOverview };
