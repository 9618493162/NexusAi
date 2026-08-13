import { WorkflowNode, WorkflowEdge } from "@/services/workflows.service";

export interface NodeCategoryMeta {
  label: string;
  color: string; // tailwind text color
  bg: string; // tailwind bg color
  dot: string; // tailwind bg for the status dot
}

export const NODE_CATEGORIES: Record<string, NodeCategoryMeta> = {
  input: { label: "Input", color: "text-emerald-500", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  ai: { label: "AI", color: "text-violet-500", bg: "bg-violet-500/10", dot: "bg-violet-500" },
  voice: { label: "Voice", color: "text-blue-500", bg: "bg-blue-500/10", dot: "bg-blue-500" },
  create: { label: "Create", color: "text-pink-500", bg: "bg-pink-500/10", dot: "bg-pink-500" },
  data: { label: "Data", color: "text-teal-500", bg: "bg-teal-500/10", dot: "bg-teal-500" },
  logic: { label: "Logic", color: "text-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500" },
  output: { label: "Output", color: "text-cyan-500", bg: "bg-cyan-500/10", dot: "bg-cyan-500" },
};

export interface NodeTypeMeta {
  type: string;
  label: string;
  description: string;
  category: keyof typeof NODE_CATEGORIES;
  icon: string; // emoji — lightweight, no extra icon lib
  ports: string[]; // output ports ("out" | "true" | "false")
  source: boolean;
}

export const NODE_TYPES: NodeTypeMeta[] = [
  { type: "text", label: "Text input", description: "Static text that feeds the workflow", category: "input", icon: "📝", ports: ["out"], source: true },
  { type: "file", label: "File", description: "Extracted text from one of your files", category: "input", icon: "📄", ports: ["out"], source: true },
  { type: "audio", label: "Audio", description: "An audio file from your library", category: "input", icon: "🎙️", ports: ["out"], source: true },
  { type: "ai", label: "AI", description: "Custom prompt — use {{input}} for the incoming value", category: "ai", icon: "✨", ports: ["out"], source: false },
  { type: "analyze", label: "Analyze", description: "File analysis over the incoming text", category: "ai", icon: "🔍", ports: ["out"], source: false },
  { type: "summarize", label: "Summarize", description: "Condense the incoming content", category: "ai", icon: "🧠", ports: ["out"], source: false },
  { type: "translate", label: "Translate", description: "Translate into the target language", category: "ai", icon: "🌐", ports: ["out"], source: false },
  { type: "transcribe", label: "Transcribe", description: "Real speech-to-text from audio", category: "voice", icon: "🎧", ports: ["out"], source: false },
  { type: "tts", label: "Text to speech", description: "Speak the incoming text aloud", category: "voice", icon: "🔊", ports: ["out"], source: false },
  { type: "image", label: "Image", description: "Generate an image from the prompt", category: "create", icon: "🖼️", ports: ["out"], source: false },
  { type: "video", label: "Video", description: "Generate a video from the prompt", category: "create", icon: "🎬", ports: ["out"], source: false },
  { type: "magicslides", label: "MagicSlides deck", description: "Generate a real PPTX+PDF deck from the incoming text", category: "create", icon: "📊", ports: ["out"], source: false },
  { type: "markets", label: "Markets", description: "Detect tickers and fetch real Massive.com market data", category: "data", icon: "📈", ports: ["out"], source: false },
  { type: "condition", label: "Condition", description: "Route by a rule on the incoming text", category: "logic", icon: "🔀", ports: ["true", "false"], source: false },
  { type: "output", label: "Output", description: "The workflow's final result", category: "output", icon: "🏁", ports: [], source: false },
];

const NODE_BY_TYPE = new Map(NODE_TYPES.map((n) => [n.type, n]));
export const nodeMeta = (type: string): NodeTypeMeta | undefined => NODE_BY_TYPE.get(type);

export const DEFAULT_MODEL = "gemini-flash-latest";

let counter = 0;
export function makeNodeId(prefix = "n"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}
export function makeEdgeId(): string {
  counter += 1;
  return `e${Date.now().toString(36)}${counter}`;
}

export function newNode(type: string, x: number, y: number): WorkflowNode {
  const config: Record<string, any> = {};
  if (type === "text") config.value = "";
  if (type === "ai") config.prompt = "{{input}}";
  if (type === "translate") config.target = "Hindi";
  if (type === "image" || type === "video") config.prompt = "";
  if (type === "magicslides") config.slideCount = 8;
  if (type === "condition") config.mode = "contains";
  return { id: makeNodeId(), type, x, y, config };
}

/** Frontend mirror of the backend validator — gives instant feedback. */
export function validateGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const errors: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (nodes.length === 0) {
    return ["The workflow is empty — add at least one node."];
  }
  for (const n of nodes) {
    const meta = nodeMeta(n.type);
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
    if (!byId.has(e.from) || !byId.has(e.to)) errors.push("A connection references a node that no longer exists.");
    const fromMeta = byId.get(e.from) ? nodeMeta(byId.get(e.from)!.type) : undefined;
    if (fromMeta && !fromMeta.ports.includes(e.fromPort)) errors.push(`“${fromMeta.label}” has no output port “${e.fromPort}”.`);
  }
  for (const n of nodes) {
    const meta = nodeMeta(n.type)!;
    if (meta.source) continue;
    if ((incoming.get(n.id) ?? 0) === 0) errors.push(`“${meta.label}” has no incoming connection.`);
  }
  if (!nodes.some((n) => n.type === "output")) {
    errors.push("Add an Output node so the workflow has a result.");
  } else if (!nodes.some((n) => n.type === "output" && (incoming.get(n.id) ?? 0) > 0)) {
    errors.push("The Output node needs an incoming connection.");
  }
  // Cycle detection
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
  return errors;
}

/* ── Templates — every one is an executable graph of real capabilities ── */

function place(index: number): { x: number; y: number } {
  return { x: 40 + index * 260, y: 80 + (index % 2) * 60 };
}

function buildTemplate(name: string, description: string, defs: Array<{ type: string; config?: Record<string, any>; branch?: "true" | "false"; via?: number; from?: number }>): { name: string; description: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const idByIndex = new Map<number, string>();
  defs.forEach((def, i) => {
    const id = makeNodeId("t");
    const pos = place(i);
    nodes.push({ id, type: def.type, x: pos.x, y: pos.y, config: def.config || {} });
    idByIndex.set(i, id);
  });
  defs.forEach((def, i) => {
    if (i === 0) return;
    // A branch edge originates from the condition node (`from`), a via edge
    // from the node at that index, everything else from the previous node.
    const fromIdx = def.from !== undefined ? def.from : def.via !== undefined ? def.via : i - 1;
    const from = idByIndex.get(fromIdx)!;
    const to = idByIndex.get(i)!;
    edges.push({ id: makeEdgeId(), from, fromPort: def.branch || "out", to });
  });
  return { name, description, nodes, edges };
}

export const TEMPLATES: Array<{ name: string; description: string; icon: string; build: () => { nodes: WorkflowNode[]; edges: WorkflowEdge[] } }> = [
  {
    name: "Quick answer",
    description: "Ask NexusAI anything",
    icon: "⚡",
    build: () => buildTemplate("Quick answer", "Ask a question and get the answer", [
      { type: "text", config: { value: "Explain black holes in two sentences." } },
      { type: "ai", config: { prompt: "{{input}}" } },
      { type: "output" },
    ]),
  },
  {
    name: "Summarize & translate",
    description: "Condense, then translate",
    icon: "🌐",
    build: () => buildTemplate("Summarize & translate", "Summarize and translate a text", [
      { type: "text", config: { value: "Paste or type the text you want summarized here." } },
      { type: "summarize" },
      { type: "translate", config: { target: "Hindi" } },
      { type: "output" },
    ]),
  },
  {
    name: "Document analysis",
    description: "Analyze one of your files",
    icon: "📄",
    build: () => buildTemplate("Document analysis", "Analyze and summarize a document", [
      { type: "file" },
      { type: "analyze" },
      { type: "summarize" },
      { type: "output" },
    ]),
  },
  {
    name: "Audio transcript",
    description: "Transcribe, then summarize",
    icon: "🎧",
    build: () => buildTemplate("Audio transcript", "Transcribe an audio file and summarize it", [
      { type: "audio" },
      { type: "transcribe" },
      { type: "summarize" },
      { type: "output" },
    ]),
  },
  {
    name: "Branching report",
    description: "Route by content",
    icon: "🔀",
    build: () => buildTemplate("Branching report", "Route text based on a condition", [
      { type: "text", config: { value: "The quarterly report shows strong growth." } },
      { type: "condition", config: { mode: "contains", value: "report" } },
      { type: "summarize", branch: "true" },
      { type: "translate", config: { target: "Telugu" }, branch: "false", from: 1 },
      { type: "output", via: 2 },
    ]),
  },
  {
    name: "Text to speech",
    description: "Generate spoken audio",
    icon: "🔊",
    build: () => buildTemplate("Text to speech", "Turn text into an AI voiceover", [
      { type: "text", config: { value: "Welcome to NexusAI workflows." } },
      { type: "ai", config: { prompt: "Write a short, natural-sounding voiceover line based on: {{input}}" } },
      { type: "tts" },
      { type: "output" },
    ]),
  },
  {
    name: "Text to deck",
    description: "Turn content into a MagicSlides deck",
    icon: "📊",
    build: () => buildTemplate("Text to deck", "Generate a real PPTX+PDF presentation from text", [
      { type: "text", config: { value: "The three pillars of renewable energy storage in 2026: batteries, pumped hydro, and green hydrogen." } },
      { type: "magicslides", config: { topic: "Renewable Energy Storage in 2026", slideCount: 8 } },
      { type: "output" },
    ]),
  },
  {
    name: "Market brief",
    description: "Fetch live data for tickers in your text",
    icon: "📈",
    build: () => buildTemplate("Market brief", "Detect tickers and fetch real Massive.com market data", [
      { type: "text", config: { value: "Compare the recent performance and news around AAPL and TSLA in 2026." } },
      { type: "markets" },
      { type: "summarize" },
      { type: "output" },
    ]),
  },
];
