import fs from "fs";
import path from "path";
import { prisma } from "../config/database";
import { streamChat } from "./chat.service";

/**
 * AI Data Analysis Lab — real, additive, ownership-scoped.
 *
 * This service does NOT create a second storage or database system. It reads
 * the authenticated user's existing uploaded files straight from disk
 * (uploads/), parses structured formats server-side (CSV / TSV / JSON), and
 * computes REAL statistics. Natural-language questions are answered through
 * the existing chat AI pipeline with the real dataset context — the AI can
 * only reason over data the owner already uploaded.
 */

const MAX_ROWS = 50000; // hard ceiling per file so huge uploads fail loudly
const MAX_FIELD_LEN = 4000;

export interface ColumnInfo {
  name: string;
  index: number;
  type: "number" | "date" | "boolean" | "text";
  missing: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sum?: number;
}

export interface DatasetOverview {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  format: "csv" | "tsv" | "json" | "jsonl" | "xlsx" | "other";
  rows: number;
  columns: number;
  columnNames: string[];
  missingCells: number;
  duplicateRows: number;
  columnsInfo: ColumnInfo[];
  preview: Record<string, string | number | boolean | null>[];
  notes: string[];
}

/** Detect the structured format from the file name/mime. */
export function detectFormat(filename: string, mimeType?: string | null): DatasetOverview["format"] {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".csv" || mimeType === "text/csv") return "csv";
  if (ext === ".tsv") return "tsv";
  if (ext === ".json") return "json";
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".xlsx" || ext === ".xls" || mimeType === "application/vnd.ms-excel") return "xlsx";
  return "other";
}

/** Minimal but correct CSV/TSV parser (RFC-style quoting). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field !== "" || row.length > 0) pushRow();

  // Drop fully-empty trailing rows and any row that is entirely empty cells.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function inferCell(raw: string): string | number | boolean | null {
  const s = raw.trim();
  if (s === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length < 20) {
    const num = Number(s);
    if (Number.isFinite(num)) return num;
  }
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
  return s;
}

function inferColumnType(values: Array<string | number | boolean | null>): ColumnInfo["type"] {
  const nonNull = values.filter((v) => v !== null);
  if (nonNull.length === 0) return "text";
  const numeric = nonNull.filter((v) => typeof v === "number");
  if (numeric.length >= Math.max(1, nonNull.length * 0.8)) return "number";
  const dateLike = nonNull.filter(
    (v) => typeof v === "string" && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v)
  );
  if (dateLike.length >= nonNull.length * 0.8) return "date";
  const bool = nonNull.filter((v) => typeof v === "boolean");
  if (bool.length === nonNull.length) return "boolean";
  return "text";
}

function toNumber(v: string | number | boolean | null): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}

function medianSorted(sorted: number[]): number {
  const m = sorted.length;
  if (m === 0) return 0;
  const mid = Math.floor(m / 2);
  return m % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildColumns(rows: Record<string, string | number | boolean | null>[], names: string[]): ColumnInfo[] {
  return names.map((name, index) => {
    const values = rows.map((r) => r[name]);
    const type = inferColumnType(values);
    const missing = values.filter((v) => v === null).length;
    const unique = new Set(values.map((v) => (v === null ? "«null»" : String(v)))).size;

    const info: ColumnInfo = {
      name,
      index,
      type,
      missing,
      unique,
    };

    if (type === "number") {
      const nums = values
        .map(toNumber)
        .filter((v): v is number => v !== null);
      if (nums.length) {
        const sorted = [...nums].sort((a, b) => a - b);
        info.min = sorted[0];
        info.max = sorted[sorted.length - 1];
        info.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        info.median = medianSorted(sorted);
        info.sum = nums.reduce((a, b) => a + b, 0);
      }
    }

    return info;
  });
}

/** Load + parse a user-owned file into rows, or throw a clear error. */
export async function loadDataset(userId: string, fileId: string): Promise<{
  overview: DatasetOverview;
  rows: Record<string, string | number | boolean | null>[];
}> {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId } });
  if (!file) throw new Error("File not found or you don't have access to it.");
  if (!file.path || !fs.existsSync(file.path)) {
    throw new Error("The file data is unavailable on the server.");
  }

  const format = detectFormat(file.originalName || file.filename, file.mimeType);
  const notes: string[] = [];

  let text = "";
  if (format === "xlsx") {
    // No native XLSX parser exists server-side; the file processor already
    // extracts text at upload time. Use that honestly, when present.
    const extracted = (file.extractedText || "").trim();
    if (!extracted) {
      throw new Error(
        "Excel files need the file processor to extract their content. Upload a CSV/TSV/JSON export instead."
      );
    }
    text = extracted;
    notes.push("Excel content comes from the file processor's text extraction (no native XLSX parsing).");
    return parseTextRows(userId, file, text, "other", notes);
  }

  const raw = fs.readFileSync(file.path, "utf8");
  if (raw.length > 60 * 1024 * 1024) {
    throw new Error("This file is too large to analyze (max 60MB of text).");
  }
  return parseTextRows(userId, file, raw, format, notes);
}

/** Build a full DatasetOverview from already-parsed rows (shared by files + market data). */
export function buildRowsOverview(opts: {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  format: DatasetOverview["format"];
  rows: Record<string, string | number | boolean | null>[];
  notes: string[];
}): DatasetOverview {
  const { fileId, originalName, mimeType, size, format, rows, notes } = opts;
  const columnNames = rows.length ? Object.keys(rows[0]) : [];
  const columnsInfo = buildColumns(rows, columnNames);

  // Duplicate-row detection (canonical JSON of each row).
  const seenRows = new Set<string>();
  let duplicateRows = 0;
  for (const r of rows) {
    const key = JSON.stringify(r);
    if (seenRows.has(key)) duplicateRows += 1;
    else seenRows.add(key);
  }

  const missingCells = columnsInfo.reduce((a, c) => a + c.missing, 0);

  return {
    fileId,
    originalName,
    mimeType,
    size,
    format,
    rows: rows.length,
    columns: columnNames.length,
    columnNames,
    missingCells,
    duplicateRows,
    columnsInfo,
    preview: rows.slice(0, 50),
    notes,
  };
}

function parseTextRows(
  userId: string,
  file: { id: string; originalName: string; mimeType: string | null; size: number },
  text: string,
  format: DatasetOverview["format"],
  notes: string[]
): { overview: DatasetOverview; rows: Record<string, string | number | boolean | null>[] } {
  let table: string[][];
  let columnNames: string[];

  if (format === "json" || format === "jsonl") {
    const parsed = format === "jsonl" ? parseJsonl(text) : parseJsonArray(text);
    if (!parsed) throw new Error("The JSON file is not an array of objects. Export a JSON array of row objects instead.");
    columnNames = parsed.names;
    table = parsed.rows.map((r) => columnNames.map((c) => (r[c] === undefined ? "" : String(r[c]))));
  } else {
    table = parseDelimited(text, format === "tsv" ? "\t" : ",");
    if (table.length === 0) throw new Error("The file has no readable rows.");
    columnNames = table[0].map((c) => c.trim() || `column_${c.length ? "" : ""}` || `col_${table[0].indexOf(c) + 1}`);
    // Clean duplicate/blank header names.
    const seen = new Map<string, number>();
    columnNames = columnNames.map((name, i) => {
      const base = name || `column_${i + 1}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count > 0 ? `${base}_${count + 1}` : base;
    });
    table = table.slice(1);
  }

  if (table.length > MAX_ROWS) {
    throw new Error(
      `This file has ${table.length.toLocaleString()} rows — the Data Lab analyzes up to ${MAX_ROWS.toLocaleString()} per file.`
    );
  }

  const rows = table.map((cells) => {
    const rec: Record<string, string | number | boolean | null> = {};
    columnNames.forEach((name, i) => {
      const raw = (cells[i] ?? "").slice(0, MAX_FIELD_LEN);
      rec[name] = inferCell(raw);
    });
    return rec;
  });

  const overview = buildRowsOverview({
    fileId: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType || "",
    size: file.size,
    format,
    rows,
    notes,
  });

  return { overview, rows };
}

function parseJsonArray(text: string): { names: string[]; rows: Record<string, string | number | boolean | null>[] } | null {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return null;
    const names = Array.from(
      new Set(data.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))
    );
    if (names.length === 0) return null;
    const rows = data
      .filter((r) => r && typeof r === "object" && !Array.isArray(r))
      .map((r) => {
        const rec: Record<string, string | number | boolean | null> = {};
        for (const k of names) {
          const v = (r as Record<string, unknown>)[k];
          rec[k] = v === undefined || v === null ? null : typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
        }
        return rec;
      });
    return { names, rows };
  } catch {
    return null;
  }
}

function parseJsonl(text: string): { names: string[]; rows: Record<string, string | number | boolean | null>[] } | null {
  try {
    const rows = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => r && typeof r === "object" && !Array.isArray(r));
    if (rows.length === 0) return null;
    const names = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return { names, rows };
  } catch {
    return null;
  }
}

/** Build the real dataset context we hand to the AI. */
export function buildContext(overview: DatasetOverview, rows: Record<string, string | number | boolean | null>[], rowLimit = 60): string {
  const cols = overview.columnsInfo
    .map((c) => {
      let line = `- ${c.name} (${c.type}`;
      if (c.type === "number" && c.min !== undefined) {
        line += `, min ${c.min}, max ${c.max}, mean ${c.mean?.toFixed(2)}, median ${c.median}`;
      }
      line += `, ${c.unique} unique, ${c.missing} missing)`;
      return line;
    })
    .join("\n");

  const sample = rows.slice(0, rowLimit).map((r) => JSON.stringify(r)).join("\n");
  return [
    `DATASET: ${overview.originalName}`,
    `ROWS: ${overview.rows}`,
    `COLUMNS: ${overview.columns}`,
    `MISSING CELLS: ${overview.missingCells}`,
    `DUPLICATE ROWS: ${overview.duplicateRows}`,
    "",
    "COLUMN TYPES & STATISTICS:",
    cols,
    "",
    "SAMPLE ROWS (first up to " + rowLimit + "):",
    sample,
  ].join("\n");
}

export const SYSTEM_PROMPT =
  "You are a precise data analyst working inside NexusAI's Data Lab. You answer questions about a real dataset the user uploaded. " +
  "Use ONLY the dataset context provided — never invent rows, columns, or numbers. If the data doesn't contain the answer, say so plainly. " +
  "When the user asks for a chart, respond with a fenced code block labeled ```chart``` containing a single JSON object. " +
  "The JSON must be one of these shapes and MUST use real values from the data:\n" +
  "- Bar: {\"type\":\"bar\",\"labels\":[string],\"series\":[{\"name\":string,\"values\":[number]}]}\n" +
  "- Line: {\"type\":\"line\",\"labels\":[string],\"series\":[{\"name\":string,\"values\":[number]}]}\n" +
  "- Pie: {\"type\":\"pie\",\"labels\":[string],\"values\":[number]}\n" +
  "- Scatter: {\"type\":\"scatter\",\"points\":[{\"x\":number,\"y\":number,\"label\":string}]}\n" +
  "Keep charts small (<= 12 categories). Aggregate with real math (group by, sum, mean). If a chart is not appropriate, do not emit one.";

/** Convert an AI reply containing a ```chart``` fence into chart data (real numbers only). */
export function extractChart(text: string): { chart: any; clean: string } | null {
  const m = text.match(/```chart\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    const chart = JSON.parse(m[1]);
    if (!chart || typeof chart !== "object" || !chart.type) return null;
    return { chart, clean: text.replace(/```chart\s*\n[\s\S]*?```/, "").trim() };
  } catch {
    return null;
  }
}

/**
 * Answer a natural-language question about a real dataset, streaming through
 * the existing AI pipeline. Returns an AsyncGenerator of text chunks.
 */
export async function* askDataset(
  userId: string,
  fileId: string,
  question: string
): AsyncGenerator<string, void, unknown> {
  const { overview, rows } = await loadDataset(userId, fileId);
  yield* streamAnswer(userId, question, overview, rows);
}

/** Try providers in order — analysis must survive a single provider outage. */
export async function* streamWithFallback(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId: string
): AsyncGenerator<string, void, unknown> {
  const candidates = ["gemini-flash-latest", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"];
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      yield* streamChat(messages, model, userId, "data-analysis");
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All AI providers failed.");
}

/** Shared streaming answer over a real dataset context (files or market data). */
export async function* streamAnswer(
  userId: string,
  question: string,
  overview: DatasetOverview,
  rows: Record<string, string | number | boolean | null>[]
): AsyncGenerator<string, void, unknown> {
  const context = buildContext(overview, rows);
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: `DATASET CONTEXT:\n${context}\n\nQUESTION: ${question}` },
  ];
  yield* streamWithFallback(messages, userId);
}

/** Streaming answer over a REAL Massive.com market dataset (dividend history + news sentiment). */
export async function* askMarketDataset(
  userId: string,
  question: string,
  dividendsOverview: DatasetOverview,
  dividendsRows: Record<string, string | number | boolean | null>[],
  newsOverview: DatasetOverview,
  newsRows: Record<string, string | number | boolean | null>[]
): AsyncGenerator<string, void, unknown> {
  const context = [
    "MASSIVE.COM MARKET DATASET (real free-tier data for the requested ticker):",
    "",
    "TABLE 1 — DIVIDEND HISTORY:",
    buildContext(dividendsOverview, dividendsRows),
    "",
    "TABLE 2 — NEWS SENTIMENT:",
    buildContext(newsOverview, newsRows),
  ].join("\n");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: `DATASET CONTEXT:\n${context}\n\nQUESTION: ${question}` },
  ];
  yield* streamWithFallback(messages, userId);
}

/** Export the analyzed rows back as CSV (real data, server-generated). */
export async function exportCsv(userId: string, fileId: string): Promise<{ filename: string; csv: string } | null> {
  const { overview, rows } = await loadDataset(userId, fileId);
  const esc = (v: string | number | boolean | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    overview.columnNames.join(","),
    ...rows.map((r) => overview.columnNames.map((c) => esc(r[c])).join(",")),
  ].join("\n");
  const base = overview.originalName.replace(/\.[^.]+$/, "");
  return { filename: `${base}_analysis.csv`, csv };
}
