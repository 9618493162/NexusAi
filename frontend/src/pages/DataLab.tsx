import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Database,
  Upload,
  Loader2,
  FileText,
  Table2,
  Sparkles,
  Send,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ArrowUpDown,
  TrendingUp,
} from "lucide-react";
import { NexusCore } from "@/components/ui/nexus-core";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/utils/cn";
import {
  listDataFiles,
  analyzeDataset,
  askDataset,
  askMarketData,
  analyzeMarketData,
  datasetExportUrl,
  marketExportUrl,
  DataFile,
  DatasetOverview,
  MarketDataset,
  MarketTable,
} from "@/services/data.service";
import { fileService } from "@/services/file.service";

const SUGGESTIONS = [
  "Explain this dataset",
  "What are the top values?",
  "Show a chart of the most important numbers",
  "Find unusual values or outliers",
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* ---------- Tiny SVG charts (rendered from REAL values) ---------- */

interface ChartData {
  type: string;
  labels?: string[];
  values?: number[];
  series?: Array<{ name: string; values: number[] }>;
  points?: Array<{ x: number; y: number; label?: string }>;
}

function BarChart({ data, height = 200 }: { data: ChartData; height?: number }) {
  const series = data.series?.[0];
  const values = series?.values || data.values || [];
  const labels = data.labels || [];
  const max = Math.max(1, ...values);
  const w = 600;
  const barW = Math.max(10, Math.min(46, (w - 40) / Math.max(1, values.length) - 8));
  const reduced = useReducedMotion();

  return (
    <svg viewBox={`0 0 ${w} ${height + 30}`} className="h-auto w-full" role="img" aria-label={`Bar chart: ${series?.name || "values"}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={30} x2={w - 10} y1={10 + (height - 10) * (1 - f)} y2={10 + (height - 10) * (1 - f)} stroke="currentColor" strokeOpacity={0.08} />
      ))}
      {values.map((v, i) => {
        const x = 30 + i * (barW + 8) + 4;
        const h = ((v / max) * (height - 14));
        const y = height - h + 10;
        return (
          <g key={i}>
            <motion.rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={4}
              fill="hsl(var(--primary))"
              fillOpacity={0.85}
              initial={reduced ? false : { y: height, opacity: 0 }}
              animate={{ y, opacity: 1 }}
              transition={{ delay: i * 0.04, duration: 0.4, ease: "easeOut" }}
            />
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.75}>{fmtNum(v)}</text>
            {labels[i] !== undefined && (
              <text x={x + barW / 2} y={height + 20} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>{String(labels[i]).slice(0, 12)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, height = 200 }: { data: ChartData; height?: number }) {
  const series = data.series?.[0];
  const values = series?.values || data.values || [];
  const labels = data.labels || [];
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const w = 600;
  const n = values.length;
  const step = n > 1 ? (w - 60) / (n - 1) : 0;
  const px = (i: number) => 30 + i * step;
  const py = (v: number) => 10 + ((max - v) / range) * (height - 20);
  const reduced = useReducedMotion();
  const pts = values.map((v, i) => [px(i), py(v)] as const);

  return (
    <svg viewBox={`0 0 ${w} ${height + 30}`} className="h-auto w-full" role="img" aria-label={`Line chart: ${series?.name || "values"}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={30} x2={w - 10} y1={10 + (height - 10) * (1 - f)} y2={10 + (height - 10) * (1 - f)} stroke="currentColor" strokeOpacity={0.08} />
      ))}
      <motion.polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
      />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={3.5} fill="hsl(var(--primary))" />
          <text x={x} y={y - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.7}>{fmtNum(values[i])}</text>
          {labels[i] !== undefined && (
            <text x={x} y={height + 20} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>{String(labels[i]).slice(0, 10)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function PieChart({ data }: { data: ChartData }) {
  const labels = data.labels || [];
  const values = data.values || [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const colors = ["hsl(var(--primary))", "hsl(162 88% 56%)", "hsl(38 92% 58%)", "hsl(262 83% 66%)", "hsl(350 89% 60%)", "hsl(199 89% 55%)"];
  const reduced = useReducedMotion();

  const arcs = values.map((v, i) => {
    const start = angle;
    const sweep = (v / total) * Math.PI * 2;
    angle += sweep;
    const cx = 110, cy = 100, r = 85;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(start + sweep);
    const y2 = cy + r * Math.sin(start + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, color: colors[i % colors.length], label: labels[i], value: v };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 220 200" className="h-48 w-48 shrink-0" role="img" aria-label="Pie chart">
        {arcs.map((a, i) => (
          <motion.path
            key={i}
            d={a.d}
            fill={a.color}
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
          />
        ))}
      </svg>
      <ul className="min-w-40 space-y-1.5 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
            <span className="flex-1 truncate text-muted-foreground">{a.label}</span>
            <span className="font-medium">{fmtNum(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScatterChart({ data }: { data: ChartData }) {
  const pts = data.points || [];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const maxX = Math.max(1, ...xs);
  const maxY = Math.max(1, ...ys);
  const w = 560, h = 220, pad = 34;
  const px = (x: number) => pad + (x / maxX) * (w - pad * 2);
  const py = (y: number) => h - pad - (y / maxY) * (h - pad * 2);
  const reduced = useReducedMotion();

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Scatter chart">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="currentColor" strokeOpacity={0.2} />
      {pts.map((p, i) => (
        <g key={i}>
          <motion.circle
            cx={px(p.x)}
            cy={py(p.y)}
            r={6}
            fill="hsl(var(--primary))"
            fillOpacity={0.6}
            stroke="hsl(var(--primary))"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
          />
          {p.label && (
            <text x={px(p.x)} y={py(p.y) - 9} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.65}>{String(p.label).slice(0, 14)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function ChartView({ data }: { data: ChartData }) {
  if (data.type === "pie") return <PieChart data={data} />;
  if (data.type === "scatter") return <ScatterChart data={data} />;
  if (data.type === "line") return <LineChart data={data} />;
  return <BarChart data={data} />;
}

/* ---------- Main page ---------- */

export function DataLab() {
  const [files, setFiles] = useState<DataFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [overview, setOverview] = useState<DatasetOverview | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragError, setDragError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Market dataset (real Massive.com data — analyzed exactly like a file).
  const [market, setMarket] = useState<MarketDataset | null>(null);
  const [marketTicker, setMarketTicker] = useState("");
  const [marketTab, setMarketTab] = useState<MarketTable>("dividends");
  const [marketLoading, setMarketLoading] = useState(false);

  // Table controls.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const PAGE_SIZE = 20;

  // AI panel.
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiStage, setAiStage] = useState<"idle" | "loading" | "analyzing" | "streaming" | "failed">("idle");
  const [chart, setChart] = useState<ChartData | null>(null);
  const [history, setHistory] = useState<Array<{ q: string; a: string }>>([]);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const [askError, setAskError] = useState("");
  // Mobile slide-in drawer for the Ask-your-data panel (the desktop column
  // stays beside the table; on phones the same panel opens from a trigger).
  const [askOpen, setAskOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const f = await listDataFiles();
      setFiles(f);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load files.");
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
    return () => abortRef.current?.abort();
  }, [loadFiles]);

  const openDataset = useCallback(async (id: string) => {
    setLoadingDataset(true);
    setOverview(null);
    setMarket(null);
    setAnswer("");
    setChart(null);
    setHistory([]);
    setPage(0);
    setSortCol(null);
    setQuery("");
    setError("");
    try {
      const o = await analyzeDataset(id);
      setOverview(o);
    } catch (e: any) {
      setError(e?.message || "Could not analyze this file.");
    } finally {
      setLoadingDataset(false);
    }
  }, []);

  const loadMarket = useCallback(async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    if (!/^[A-Z]{1,5}$/.test(t)) {
      setError("Enter a ticker like AAPL or TSLA (1–5 letters).");
      return;
    }
    setMarketLoading(true);
    setOverview(null);
    setMarket(null);
    setAnswer("");
    setChart(null);
    setHistory([]);
    setPage(0);
    setSortCol(null);
    setQuery("");
    setError("");
    try {
      const m = await analyzeMarketData(t);
      setMarket(m);
      setMarketTab("dividends");
      setMarketTicker(t);
    } catch (e: any) {
      setError(e?.message || `Could not load market data for ${t}.`);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const handleFilePicked = useCallback(
    async (file: File) => {
      const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
      const ok = [".csv", ".tsv", ".json", ".jsonl", ".xlsx", ".xls"].includes(ext);
      if (!ok) {
        setDragError(`${file.name} — the Data Lab supports CSV, TSV, JSON, JSONL and Excel files.`);
        return;
      }
      setDragError("");
      setUploading(true);
      setError("");
      try {
        const { data } = await fileService.upload(file);
        await loadFiles();
        await openDataset(data.id);
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [loadFiles, openDataset]
  );

  // The active dataset: an uploaded file OR the selected market table.
  const activeOverview: DatasetOverview | null = market
    ? marketTab === "dividends"
      ? market.dividends
      : market.news
    : overview;
  const isMarket = !!market;

  const filteredRows = useMemo(() => {
    if (!activeOverview) return [];
    const rows = activeOverview.preview;
    let out = rows;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) => activeOverview.columnNames.some((c) => String(r[c] ?? "").toLowerCase().includes(q)));
    }
    if (sortCol) {
      out = [...out].sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
        return sortAsc ? String(va ?? "").localeCompare(String(vb ?? "")) : String(vb ?? "").localeCompare(String(va ?? ""));
      });
    }
    return out;
  }, [activeOverview, query, sortCol, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const ask = useCallback(
    (q: string) => {
      if ((!overview && !market) || !q.trim()) return;
      abortRef.current?.abort();
      setAnswer("");
      setChart(null);
      setAskError("");
      setAiStage("loading");
      const handlers = {
        onStatus: (s: string) => setAiStage(s === "failed" ? "failed" : s === "analyzing" ? "analyzing" : "streaming"),
        onChunk: (t: string) => setAnswer((prev) => prev + t),
        onError: (m: string) => setAskError(m),
        onDone: () => setAiStage((s) => (s === "failed" ? s : "idle")),
      };
      const stream = market
        ? askMarketData(market.ticker, q.trim(), handlers)
        : askDataset(overview!.fileId, q.trim(), handlers);
      abortRef.current = stream;
    },
    [overview, market]
  );

  // Extract the chart block once the stream settles.
  useEffect(() => {
    if (!answer) {
      setChart(null);
      return;
    }
    const m = answer.match(/```chart\s*\n([\s\S]*?)```/);
    if (m) {
      try {
        setChart(JSON.parse(m[1]));
      } catch {
        setChart(null);
      }
    } else {
      setChart(null);
    }
  }, [answer]);

  const cleanAnswer = useMemo(() => answer.replace(/```chart\s*\n[\s\S]*?```/g, "").trim(), [answer]);

  const submitQuestion = useCallback(() => {
    const q = question.trim();
    if (!q) return;
    setHistory((h) => [...h, { q, a: "" }]);
    ask(q);
    setQuestion("");
  }, [question, ask]);

  const ready = (!!overview && !loadingDataset) || (!!market && !marketLoading);

  // The "Ask your data" panel — rendered in the desktop column AND the mobile
  // drawer from the same state, so answers/streams stay in sync everywhere.
  const askPanel = (
    <div className="card-surface rounded-2xl p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Ask your data
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Answers are generated by the AI pipeline with this dataset's real rows and statistics as context.
      </p>
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitQuestion()}
          placeholder="e.g. Which region had the highest revenue?"
          className="surface-glow h-9 flex-1 rounded-lg border border-border bg-card/80 px-3 text-sm outline-none backdrop-blur-sm transition-colors focus:border-primary/50"
        />
        <button
          onClick={submitQuestion}
          disabled={!question.trim() || aiStage === "loading" || aiStage === "analyzing"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          aria-label="Ask"
        >
          {aiStage === "loading" || aiStage === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={aiStage === "loading" || aiStage === "analyzing"}
            className="rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      {(aiStage === "loading" || aiStage === "analyzing" || aiStage === "streaming" || answer || askError) && (
        <div className="surface-glow mt-4 rounded-xl border border-border bg-card/70 p-3 backdrop-blur-md">
          {aiStage === "loading" && (
            <p className="text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Reading the dataset…
            </p>
          )}
          {aiStage === "analyzing" && (
            <p className="text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Analyzing with real statistics…
            </p>
          )}
          {askError && (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" /> {askError}
            </p>
          )}
          {cleanAnswer && (
            <div className="space-y-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{cleanAnswer}</p>
              {chart && (
                <div className="rounded-lg border border-muted bg-background/60 p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Chart · values computed from this dataset
                  </div>
                  <ChartView data={chart} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent questions</h4>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => ask(h.q)}
                className="card-surface block w-full truncate rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {h.q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpatialEnvironment />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-6 pb-8 text-center">
          <NexusCore size={150} active={aiStage === "loading" || aiStage === "analyzing" || aiStage === "streaming"} state={aiStage === "failed" ? "error" : ready ? "success" : "idle"} />
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Nexus <span className="text-primary">Data Lab</span>
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Upload or select a CSV, TSV, JSON or Excel file — then ask your data anything. Every number, chart and insight is computed from the real file.
            </p>
          </div>

          {/* Upload zone (reuses the existing File Intelligence upload) */}
          <div
            className={cn(
              "card-surface relative w-full max-w-2xl rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/20"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFilePicked(f);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.json,.jsonl,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFilePicked(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mx-auto flex flex-col items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              aria-label="Upload a dataset"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
              <span className="font-medium">{uploading ? "Uploading through File Intelligence…" : "Drop a dataset here or click to upload"}</span>
              <span className="text-xs">CSV · TSV · JSON · JSONL · XLSX (max 50MB)</span>
            </button>
            {dragError && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" /> {dragError}
              </p>
            )}
          </div>

          {/* Market dataset — real Massive.com data, analyzed like a file */}
          <div className="w-full max-w-2xl">
            <div className="card-surface rounded-2xl p-4">
              <div className="surface-glow flex items-center gap-3 rounded-xl">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500/25 via-teal-500/10 to-transparent text-teal-500 ring-1 ring-teal-500/20">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <input
                  value={marketTicker}
                  onChange={(e) => setMarketTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadMarket(marketTicker);
                  }}
                  placeholder="Or analyze a ticker's dividend history + news (e.g. AAPL)"
                  aria-label="Ticker for market dataset"
                  className="min-w-0 flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case placeholder:font-normal placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={() => void loadMarket(marketTicker)}
                  disabled={!marketTicker.trim() || marketLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-teal-600 via-teal-600/95 to-teal-500/90 px-3.5 py-2 text-sm font-medium text-white shadow-glow-primary transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {marketLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                  Load market data
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Live from Massive.com:</span>
                {["AAPL", "TSLA", "NVDA", "MSFT"].map((t) => (
                  <button
                    key={t}
                    onClick={() => void loadMarket(t)}
                    className="rounded-full border border-border bg-card/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-teal-500/50 hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Dataset picker */}
        {filesLoading ? (
          <div className="mx-auto max-w-3xl space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No datasets yet"
            description="Upload a CSV, TSV, JSON or Excel file above to start analyzing real data."
          />
        ) : (
          <div className="mx-auto mb-8 max-w-3xl">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Database className="h-4 w-4" /> Your datasets ({files.length})
            </h2>
            <div className="space-y-2">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => void openDataset(f.id)}
                  className={cn(
                    "card-surface card-hover flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left",
                    overview?.fileId === f.id && "ring-1 ring-primary/50"
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.originalName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {f.format.toUpperCase()} · {fmtBytes(f.size)} · {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  {overview?.fileId === f.id && <RefreshCw className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dataset workspace */}
        {loadingDataset && (
          <div className="mx-auto max-w-6xl space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {ready && activeOverview && (
          <div className="space-y-6">
            {/* Overview stats — every number is real */}
            <div className="card-surface rounded-2xl p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {activeOverview.originalName}
                    {isMarket && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-600 dark:text-teal-400">
                        <TrendingUp className="h-3 w-3" /> live from Massive.com
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isMarket
                      ? `${market!.ticker} · fetched ${new Date(market!.fetchedAt).toLocaleString()} · real free-tier data`
                      : `${activeOverview.format.toUpperCase()} · ${fmtBytes(activeOverview.size)} · analyzed server-side from the original file`}
                  </p>
                  {isMarket && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
                      {(["dividends", "news"] as MarketTable[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setMarketTab(t)}
                          className={cn(
                            "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                            marketTab === t ? "bg-teal-600 text-white" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t === "dividends" ? "Dividend history" : "News sentiment"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <a
                  href={isMarket ? marketExportUrl(market!.ticker, marketTab) : datasetExportUrl(activeOverview.fileId)}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Rows", value: fmtNum(activeOverview.rows), glow: "hsl(var(--primary)/0.14)" },
                  { label: "Columns", value: String(activeOverview.columns), glow: "hsl(262 83% 66% / 0.14)" },
                  { label: "Missing cells", value: fmtNum(activeOverview.missingCells), glow: "hsl(38 92% 58% / 0.14)" },
                  { label: "Duplicate rows", value: fmtNum(activeOverview.duplicateRows), glow: "hsl(350 89% 60% / 0.14)" },
                  { label: "Preview rows", value: fmtNum(activeOverview.preview.length), glow: "hsl(162 88% 56% / 0.14)" },
                  { label: isMarket ? "Records" : "Size", value: fmtNum(activeOverview.rows), glow: "hsl(199 89% 55% / 0.14)" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="card-surface relative overflow-hidden rounded-xl px-3 py-3"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,var(--glow),transparent)]"
                      style={{ "--glow": s.glow } as CSSProperties}
                    />
                    <div className="relative text-xl font-bold">{s.value}</div>
                    <div className="relative text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
              {activeOverview.notes.map((n, i) => (
                <p key={i} className="mt-3 flex items-center gap-1.5 text-xs text-amber-500/90">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {n}
                </p>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* Table + columns */}
              <div className="space-y-6 lg:col-span-3">
                <div className="card-surface rounded-2xl p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Table2 className="h-4 w-4 text-primary" /> Data preview
                      {isMarket && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          {marketTab === "dividends" ? "dividend records" : "news articles"}
                        </span>
                      )}
                    </h3>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPage(0);
                        }}
                        placeholder="Filter rows…"
                        className="surface-glow h-8 w-44 rounded-lg border border-border bg-card/80 pl-8 pr-2 text-xs outline-none backdrop-blur-sm transition-colors focus:border-primary/50"
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          {activeOverview.columnNames.map((c) => (
                            <th
                              key={c}
                              className="cursor-pointer whitespace-nowrap px-2 py-2 font-medium hover:text-foreground"
                              onClick={() => {
                                if (sortCol === c) setSortAsc(!sortAsc);
                                else {
                                  setSortCol(c);
                                  setSortAsc(true);
                                }
                              }}
                            >
                              <span className="inline-flex items-center gap-1">
                                {c} <ArrowUpDown className="h-3 w-3 opacity-50" />
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r, i) => (
                          <tr key={i} className="border-b border-muted/50 last:border-0 hover:bg-muted/30">
                            {activeOverview.columnNames.map((c) => (
                              <td key={c} className="max-w-48 truncate whitespace-nowrap px-2 py-1.5" title={String(r[c] ?? "")}>
                                {r[c] === null ? <span className="text-muted-foreground/50">—</span> : String(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {pageRows.length === 0 && (
                          <tr>
                            <td colSpan={activeOverview.columns} className="py-6 text-center text-muted-foreground">
                              No rows match the current filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {filteredRows.length} of {activeOverview.preview.length} previewed rows · page {page + 1}/{pageCount}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="rounded-md p-1 hover:bg-muted disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        disabled={page >= pageCount - 1}
                        className="rounded-md p-1 hover:bg-muted disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column types & stats */}
                <div className="card-surface rounded-2xl p-5">
                  <h3 className="mb-3 text-sm font-semibold">Columns</h3>
                  <div className="space-y-2">
                    {activeOverview.columnsInfo.map((c) => (
                      <div key={c.name} className="card-surface flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase", c.type === "number" ? "bg-primary/10 text-primary" : c.type === "date" ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground")}>
                          {c.type}
                        </span>
                        <span className="text-muted-foreground">{c.unique} unique</span>
                        {c.type === "number" && c.min !== undefined && (
                          <span className="text-muted-foreground">
                            min {fmtNum(c.min!)} · max {fmtNum(c.max!)} · mean {fmtNum(c.mean ?? 0)} · sum {fmtNum(c.sum ?? 0)}
                          </span>
                        )}
                        {c.missing > 0 && <span className="text-amber-500">{c.missing} missing</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI assistant — desktop column (mobile renders the same panel
                  from the askPanel const inside a slide-in drawer) */}
              <div className="hidden space-y-6 lg:col-span-2 lg:block">
                {askPanel}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile — floating trigger + slide-in drawer for the same AI panel */}
      {ready && (
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          aria-label="Ask your data"
          className="fixed bottom-5 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/80 px-4 py-3 text-sm font-medium text-primary-foreground shadow-glow-primary transition-all hover:opacity-90 active:scale-95 lg:hidden"
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </button>
      )}
      <MobileDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title="Ask your data"
        side="right"
        icon={<Sparkles className="h-4 w-4" />}
        panelClassName="w-full max-w-md"
      >
        {askPanel}
      </MobileDrawer>
    </div>
  );
}
