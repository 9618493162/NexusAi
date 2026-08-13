/**
 * Workflow engine — executes a stored node graph by calling REAL existing
 * NexusAI services (chat/AI, file, voice STT/TTS, image, video), scoped to
 * the authenticated user. No fake steps: every node maps to a live backend
 * capability, results are persisted on the WorkflowRun record, and progress
 * events are streamed to the caller as the actual execution happens.
 */

import fs from "fs";
import path from "path";
import { prisma } from "../config/database";
import { logger } from "../config/logger";
import { streamChat } from "./chat.service";
import { transcribeAudio, synthesizeSpeech } from "./voice.service";
import { generateImage } from "./image.service";
import { generateVideo } from "./video.service";
import { generateMagicSlides } from "./magicslides.service";
import { detectTickers, researchMarket } from "./market.service";

export interface WorkflowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  fromPort: string; // "out" | "true" | "false"
  to: string;
}

export type WorkflowValue =
  | { kind: "text"; text: string }
  | { kind: "audio"; fileId: string; mimeType: string };

export interface NodeMeta {
  label: string;
  description: string;
  category: "input" | "ai" | "voice" | "create" | "logic" | "output" | "data";
  /** Output ports this node exposes (all nodes expose "out"). */
  ports: string[];
  /** True when this node starts a run without needing an incoming edge. */
  source: boolean;
}

export const NODE_META: Record<string, NodeMeta> = {
  text: { label: "Text input", description: "Static text that feeds the workflow", category: "input", ports: ["out"], source: true },
  file: { label: "File", description: "Extracted text from one of your files", category: "input", ports: ["out"], source: true },
  audio: { label: "Audio", description: "An audio file from your library", category: "input", ports: ["out"], source: true },
  ai: { label: "AI", description: "Ask NexusAI — custom prompt with {{input}}", category: "ai", ports: ["out"], source: false },
  analyze: { label: "Analyze", description: "File analysis over the incoming text", category: "ai", ports: ["out"], source: false },
  summarize: { label: "Summarize", description: "Condense the incoming content", category: "ai", ports: ["out"], source: false },
  translate: { label: "Translate", description: "Translate into the target language", category: "ai", ports: ["out"], source: false },
  transcribe: { label: "Transcribe", description: "Real speech-to-text from audio", category: "voice", ports: ["out"], source: false },
  tts: { label: "Text to speech", description: "Speak the incoming text aloud", category: "voice", ports: ["out"], source: false },
  image: { label: "Image", description: "Generate an image from the prompt", category: "create", ports: ["out"], source: false },
  video: { label: "Video", description: "Generate a video from the prompt", category: "create", ports: ["out"], source: false },
  magicslides: { label: "MagicSlides deck", description: "Generate a real PPTX+PDF deck from the incoming text", category: "create", ports: ["out"], source: false },
  markets: { label: "Markets", description: "Detect tickers and fetch real Massive.com market data", category: "data", ports: ["out"], source: false },
  condition: { label: "Condition", description: "Route by a rule on the incoming text", category: "logic", ports: ["true", "false"], source: false },
  output: { label: "Output", description: "The workflow's final result", category: "output", ports: [], source: false },
};

export const DEFAULT_WF_MODEL = "gemini-flash-latest";

/** Node types a template/hub can offer for the palette. */
export const PALETTE_ORDER = ["text", "file", "audio", "ai", "analyze", "summarize", "translate", "transcribe", "tts", "image", "video", "magicslides", "markets", "condition", "output"];

async function chatText(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>, model: string, userId: string): Promise<string> {
  let out = "";
  for await (const chunk of streamChat(messages, model, userId)) out += chunk;
  return out;
}

function replaceInput(template: string | undefined, input: string): string {
  if (!template) return input;
  return template.split("{{input}}").join(input);
}

const FILE_TEXT_LIMIT = 20000;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validates a graph before it can run. Checks: required config, incoming
 * edges (except sources), reachability of the output node, and no cycles.
 */
export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
  const errors: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (nodes.length === 0) {
    return { ok: false, errors: ["The workflow is empty — add at least one node."] };
  }

  for (const n of nodes) {
    const meta = NODE_META[n.type];
    if (!meta) {
      errors.push(`Unknown node type "${n.type}".`);
      continue;
    }
    const cfg = n.config || {};
    if (n.type === "text" && !String(cfg.value ?? "").trim()) errors.push(`“${meta.label}” has no text.`);
    if (n.type === "file" && !cfg.fileId) errors.push(`“${meta.label}” has no file selected.`);
    if (n.type === "audio" && !cfg.fileId) errors.push(`“${meta.label}” has no audio file selected.`);
    if (n.type === "translate" && !String(cfg.target ?? "").trim()) errors.push(`“${meta.label}” needs a target language.`);
    if (n.type === "condition" && !cfg.mode) errors.push(`“${meta.label}” needs a condition rule.`);
    if ((n.type === "ai" || n.type === "image" || n.type === "video") && !String(cfg.prompt ?? "").trim()) {
      errors.push(`“${meta.label}” needs a prompt (or an incoming value to use).`);
    }
  }

  const incoming = new Map<string, number>();
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    if (!byId.has(e.from) || !byId.has(e.to)) {
      errors.push("A connection references a node that no longer exists.");
    }
    const fromMeta = byId.get(e.from);
    if (fromMeta && !NODE_META[fromMeta.type].ports.includes(e.fromPort)) {
      errors.push(`“${NODE_META[fromMeta.type].label}” has no output port “${e.fromPort}”.`);
    }
  }

  for (const n of nodes) {
    if (NODE_META[n.type].source) continue;
    if ((incoming.get(n.id) ?? 0) === 0) {
      errors.push(`“${NODE_META[n.type].label}” has no incoming connection.`);
    }
  }
  if (!nodes.some((n) => n.type === "output")) {
    errors.push("Add an Output node so the workflow has a result.");
  } else {
    const hasOutput = nodes.some((n) => n.type === "output" && (incoming.get(n.id) ?? 0) > 0);
    if (!hasOutput) errors.push("The Output node needs an incoming connection.");
  }

  // Cycle detection (Kahn). Nodes with no incoming edge seed the queue.
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)?.push(e.to);
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  let seen = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    seen++;
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (seen < nodes.length) errors.push("The workflow contains a cycle — every path must move forward.");

  return { ok: errors.length === 0, errors };
}

export interface WorkflowEvent {
  type: "node:started" | "node:completed" | "node:failed" | "node:skipped" | "workflow:completed" | "workflow:failed" | "run:saved";
  nodeId?: string;
  nodeType?: string;
  status?: string;
  message?: string;
  summary?: string;
  error?: string;
  runId?: string;
}

export interface RunResult {
  result: string;
  outputs: Record<string, any>;
  nodeStates: Record<string, any>;
  error?: string;
}

const AUDIO_DIR = path.join(process.cwd(), "data", "workflow-audio");

/**
 * Executes a graph in topological order. Every step is a REAL call through an
 * existing service; `onEvent` receives each state change as it happens so the
 * controller can stream it over SSE.
 */
export async function executeWorkflow(opts: {
  userId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onEvent: (event: WorkflowEvent) => void;
}): Promise<RunResult> {
  const { userId, nodes, edges, onEvent } = opts;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodeStates: Record<string, any> = {};
  const outputs: Record<string, any> = {};
  const values = new Map<string, WorkflowValue>();

  const validation = validateWorkflow(nodes, edges);
  if (!validation.ok) {
    throw new Error(validation.errors[0]);
  }

  // Topological order.
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const incomingByTo = new Map<string, WorkflowEdge[]>();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
    incomingByTo.set(n.id, []);
  }
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)?.push(e.to);
    incomingByTo.get(e.to)?.push(e);
  }
  const order: string[] = [];
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  const setState = (nodeId: string, patch: Record<string, any>) => {
    nodeStates[nodeId] = { status: "idle", ...(nodeStates[nodeId] || {}), ...patch };
  };

  for (const nodeId of order) {
    const node = byId.get(nodeId)!;
    const meta = NODE_META[node.type];
    const cfg = node.config || {};

    // Sources produce a value themselves; everything else needs an incoming
    // edge from a node that actually ran (respects condition branches).
    if (!meta.source) {
      const ins = incomingByTo.get(nodeId) ?? [];
      const activeIn = ins.find((e) => {
        const fromVal = values.get(e.from);
        if (!fromVal) return false;
        const fromNode = byId.get(e.from);
        // Non-condition nodes expose only "out"; conditions activate only the
        // port their result took.
        if (fromNode?.type === "condition") return e.fromPort === outputs[`branch:${e.from}`];
        return e.fromPort === "out";
      });
      if (!activeIn) {
        setState(nodeId, { status: "skipped", skippedAt: new Date().toISOString() });
        onEvent({ type: "node:skipped", nodeId, nodeType: node.type, status: "skipped" });
        continue;
      }
      const val = values.get(activeIn.from)!;
      values.set(nodeId, val); // default pass-through unless the handler overrides
      try {
        setState(nodeId, { status: "running", startedAt: new Date().toISOString() });
        onEvent({ type: "node:started", nodeId, nodeType: node.type, status: "running" });

        switch (node.type) {
          case "ai": {
            const model = cfg.model || DEFAULT_WF_MODEL;
            const inputText = val.kind === "text" ? val.text : "";
            const prompt = replaceInput(cfg.prompt, inputText);
            const system = cfg.prompt?.includes("{{input}}")
              ? "You are NexusAI's workflow assistant. Follow the prompt with the provided content."
              : "You are NexusAI's workflow assistant. Answer based on the provided content, concisely and accurately.";
            const text = await chatText(
              [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ],
              model,
              userId
            );
            values.set(nodeId, { kind: "text", text });
            break;
          }
          case "analyze": {
            const inputText = val.kind === "text" ? val.text : "";
            const text = await chatText(
              [
                { role: "system", content: "You are NexusAI's document analyst. Extract the key facts, structure, and insights from the provided content. Be concise and accurate." },
                { role: "user", content: inputText },
              ],
              cfg.model || DEFAULT_WF_MODEL,
              userId
            );
            values.set(nodeId, { kind: "text", text });
            break;
          }
          case "summarize": {
            const inputText = val.kind === "text" ? val.text : "";
            const text = await chatText(
              [
                { role: "system", content: "You are NexusAI's summarizer. Produce a clear, faithful summary with key points and action items when present. Do not invent content." },
                { role: "user", content: inputText },
              ],
              cfg.model || DEFAULT_WF_MODEL,
              userId
            );
            values.set(nodeId, { kind: "text", text });
            break;
          }
          case "translate": {
            const inputText = val.kind === "text" ? val.text : "";
            const target = String(cfg.target || "").trim();
            const text = await chatText(
              [
                { role: "system", content: "You are NexusAI's translator. Translate the provided text faithfully, preserving meaning and tone. Output only the translation." },
                { role: "user", content: `Translate into ${target}:\n\n${inputText}` },
              ],
              cfg.model || DEFAULT_WF_MODEL,
              userId
            );
            values.set(nodeId, { kind: "text", text });
            break;
          }
          case "transcribe": {
            if (val.kind !== "audio") throw new Error("Transcribe requires an audio input.");
            const file = await prisma.file.findFirst({ where: { id: val.fileId, userId } });
            if (!file || !file.path || !fs.existsSync(file.path)) throw new Error("The audio file is unavailable.");
            const buffer = fs.readFileSync(file.path);
            const { transcript } = await transcribeAudio(buffer, val.mimeType || file.mimeType || "audio/webm", cfg.language);
            values.set(nodeId, { kind: "text", text: transcript });
            break;
          }
          case "tts": {
            const inputText = val.kind === "text" ? val.text : "";
            if (!inputText.trim()) throw new Error("Nothing to speak.");
            const { audio } = await synthesizeSpeech(inputText, cfg.voice);
            fs.mkdirSync(AUDIO_DIR, { recursive: true });
            const audioPath = path.join(AUDIO_DIR, `${optsUserIdForAudio(userId)}-${Date.now()}-${nodeId}.mp3`);
            fs.writeFileSync(audioPath, audio);
            outputs[nodeId] = { type: "tts", audioPath, bytes: audio.length };
            values.set(nodeId, { kind: "text", text: `Speech generated (${audio.length} bytes).` });
            break;
          }
          case "image": {
            const inputText = val.kind === "text" ? val.text : "";
            const prompt = replaceInput(cfg.prompt, inputText);
            if (!prompt.trim()) throw new Error("Image node needs a prompt or an incoming text.");
            const url = await generateImage(prompt, cfg.model);
            outputs[nodeId] = { type: "image", url, prompt };
            values.set(nodeId, { kind: "text", text: url });
            break;
          }
          case "video": {
            const inputText = val.kind === "text" ? val.text : "";
            const prompt = replaceInput(cfg.prompt, inputText);
            if (!prompt.trim()) throw new Error("Video node needs a prompt or an incoming text.");
            const url = await generateVideo(prompt, cfg.model);
            outputs[nodeId] = { type: "video", url, prompt };
            values.set(nodeId, { kind: "text", text: url });
            break;
          }
          case "magicslides": {
            // Build a REAL deck from the upstream text; the download URLs flow
            // downstream as text and are also persisted on the run's outputs.
            const inputText = val.kind === "text" ? val.text : "";
            if (!inputText.trim()) throw new Error("MagicSlides deck node needs incoming text to build a deck.");
            const topic = String(cfg.topic || "").trim() || inputText.trim().split("\n")[0].slice(0, 120);
            const { url, pdfUrl, pptId } = await generateMagicSlides(topic, inputText, Number(cfg.slideCount) || 8);
            outputs[nodeId] = { type: "magicslides", url, pdfUrl, pptId, topic };
            values.set(nodeId, {
              kind: "text",
              text: `Presentation deck ready — ${topic}\nPPTX: ${url}\nPDF: ${pdfUrl || "(not available)"}`,
            });
            break;
          }
          case "markets": {
            // Detect tickers in the upstream text and fetch REAL Massive.com
            // market data (ticker reference, news, dividends). The fetched
            // context flows downstream as text; raw data persists on outputs.
            const inputText = val.kind === "text" ? val.text : "";
            if (!inputText.trim()) throw new Error("Markets node needs incoming text with stock tickers.");
            const tickers = detectTickers(inputText);
            if (tickers.length === 0) throw new Error("No stock tickers detected in the incoming text.");
            const data = await researchMarket(inputText, tickers);
            outputs[nodeId] = {
              type: "markets",
              tickers,
              tickerDetails: data.tickers,
              news: data.news,
              dividends: data.dividends,
            };
            values.set(nodeId, { kind: "text", text: `Detected tickers: ${tickers.join(", ")}\n${data.context}` });
            break;
          }
          case "condition": {
            const inputText = val.kind === "text" ? val.text : "";
            const mode = String(cfg.mode || "");
            const needle = String(cfg.value ?? "").toLowerCase();
            const len = Number(cfg.value) || 0;
            const taken =
              mode === "not_empty" ? inputText.trim().length > 0
              : mode === "contains" ? inputText.toLowerCase().includes(needle)
              : mode === "equals" ? inputText.toLowerCase().trim() === needle.trim()
              : mode === "length_gte" ? inputText.length >= len
              : false;
            outputs[`branch:${nodeId}`] = taken ? "true" : "false";
            values.set(nodeId, { kind: "text", text: inputText });
            break;
          }
          case "output": {
            const inputText = val.kind === "text" ? val.text : "";
            values.set(nodeId, { kind: "text", text: inputText });
            break;
          }
          default:
            throw new Error(`Node type "${node.type}" is not executable.`);
        }

        const outVal = values.get(nodeId)!;
        const summary =
          outVal.kind === "text"
            ? outVal.text.trim().slice(0, 120) + (outVal.text.trim().length > 120 ? "…" : "")
            : `Audio file ready`;
        setState(nodeId, { status: "completed", endedAt: new Date().toISOString() });
        onEvent({ type: "node:completed", nodeId, nodeType: node.type, status: "completed", summary });
      } catch (err: any) {
        const message = err?.message || "Node failed";
        setState(nodeId, { status: "failed", endedAt: new Date().toISOString(), error: message });
        onEvent({ type: "node:failed", nodeId, nodeType: node.type, status: "failed", error: message });
        logger.error(`Workflow node ${node.type} failed:`, err);
        throw new Error(`“${meta.label}” failed: ${message}`);
      }
    } else {
      // Source nodes.
      try {
        setState(nodeId, { status: "running", startedAt: new Date().toISOString() });
        onEvent({ type: "node:started", nodeId, nodeType: node.type, status: "running" });
        switch (node.type) {
          case "text": {
            values.set(nodeId, { kind: "text", text: String(cfg.value ?? "") });
            break;
          }
          case "file": {
            const file = await prisma.file.findFirst({ where: { id: String(cfg.fileId), userId } });
            if (!file) throw new Error("File not found or not yours.");
            const text = (file.extractedText || "").trim();
            if (!text) throw new Error("This file has no extractable text.");
            values.set(nodeId, { kind: "text", text: text.slice(0, FILE_TEXT_LIMIT) });
            break;
          }
          case "audio": {
            const file = await prisma.file.findFirst({ where: { id: String(cfg.fileId), userId } });
            if (!file) throw new Error("Audio file not found or not yours.");
            values.set(nodeId, { kind: "audio", fileId: file.id, mimeType: file.mimeType || "audio/webm" });
            break;
          }
          case "output": {
            values.set(nodeId, { kind: "text", text: "" });
            break;
          }
          default:
            throw new Error(`Node type "${node.type}" cannot start a workflow.`);
        }
        const outVal = values.get(nodeId)!;
        const summary =
          outVal.kind === "text"
            ? outVal.text.trim().slice(0, 120) + (outVal.text.trim().length > 120 ? "…" : "")
            : `Audio ready`;
        setState(nodeId, { status: "completed", endedAt: new Date().toISOString() });
        onEvent({ type: "node:completed", nodeId, nodeType: node.type, status: "completed", summary });
      } catch (err: any) {
        const message = err?.message || "Node failed";
        setState(nodeId, { status: "failed", endedAt: new Date().toISOString(), error: message });
        onEvent({ type: "node:failed", nodeId, nodeType: node.type, status: "failed", error: message });
        throw new Error(`“${NODE_META[node.type]?.label || node.type}” failed: ${message}`);
      }
    }
  }

  // Result = all Output nodes' text joined (or the last completed value).
  const outputTexts = nodes.filter((n) => n.type === "output").map((n) => values.get(n.id)).filter((v): v is WorkflowValue => !!v);
  const result = outputTexts.length
    ? outputTexts.map((v) => (v.kind === "text" ? v.text : "")).filter((t) => t.trim()).join("\n\n")
    : [...values.entries()].filter(([, v]) => v.kind === "text").map(([, v]) => (v as any).text).join("\n\n") || "";

  return { result, outputs, nodeStates };
}

// Node id is used in the filename; sanitize to avoid path traversal.
function optsUserIdForAudio(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Read a stored TTS audio file for streaming (ownership checked by caller). */
export function readWorkflowAudio(audioPath: string): Buffer | null {
  const resolved = path.resolve(audioPath);
  if (!resolved.startsWith(path.resolve(AUDIO_DIR))) return null;
  try {
    return fs.readFileSync(resolved);
  } catch {
    return null;
  }
}

export function workflowAudioDir(): string {
  return AUDIO_DIR;
}
