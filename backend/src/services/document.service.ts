import { prisma } from "../config/database";
import { streamChat } from "./chat.service";
import { getResearch } from "./research.service";
import { loadDataset } from "./data-analysis.service";

/**
 * Document & Presentation Studio backend.
 *
 * Documents are stored as real markdown (the source of truth). Generation runs
 * through the existing AI pipeline (outline → full document). Exports produce
 * REAL files server-side: .md natively, .html (print-ready, opens to PDF), and
 * .pptx via pptxgenjs. Nothing is faked — a download always contains the
 * document's actual content.
 */

/** Try providers in order — generation must survive a single provider outage. */
async function* streamWithFallback(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId: string
): AsyncGenerator<string, void, unknown> {
  const candidates = ["gemini-flash-latest", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"];
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      yield* streamChat(messages, model, userId);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All AI providers failed.");
}

export const DOC_TYPES: Array<{ id: string; label: string; hint: string }> = [
  { id: "report", label: "Report", hint: "Structured analysis with sections" },
  { id: "article", label: "Article", hint: "Readable long-form writing" },
  { id: "proposal", label: "Proposal", hint: "Problem → solution → plan" },
  { id: "notes", label: "Notes", hint: "Organized summary notes" },
  { id: "presentation", label: "Presentation", hint: "Slide-ready structure (# title, ## section, ### slide)" },
];

const TYPE_INSTRUCTION: Record<string, string> = {
  report: "Write a professional report with an executive summary, numbered sections, and a conclusion.",
  article: "Write a polished, readable article with an engaging introduction, clear sections, and a conclusion.",
  proposal: "Write a structured proposal: context/problem, proposed solution, plan, timeline, and expected outcomes.",
  notes: "Write clear, organized notes with bullet points and short sections. Keep it scannable.",
  presentation:
    "Write a presentation in slide-ready markdown: start with a single `# Title` line, then use `## Section` headings and `### Slide title` headings for individual slides, with 3-5 concise bullet points per slide.",
};

function typeInstruction(type: string): string {
  return TYPE_INSTRUCTION[type] || TYPE_INSTRUCTION.report;
}

export async function buildContext(userId: string, sourceType?: string | null, sourceId?: string | null): Promise<string> {
  if (!sourceType || !sourceId) return "";
  try {
    if (sourceType === "research") {
      const r = await getResearch(userId, sourceId);
      if (!r) return "";
      let summary = "";
      try {
        const s = r.summary ? JSON.parse(r.summary) : null;
        summary = s?.summary || "";
      } catch {
        summary = "";
      }
      const sources = (r.sources || [])
        .slice(0, 8)
        .map((s) => `- ${s.title}${s.url ? ` — ${s.url}` : ""}${s.kind === "file" ? " (your file)" : ""}`)
        .join("\n");
      return `SOURCE: Research session "${r.query}"\n\nSUMMARY:\n${summary || r.report || ""}\n\nSOURCES:\n${sources}`;
    }
    if (sourceType === "meeting") {
      const m = await prisma.meeting.findFirst({ where: { id: sourceId, userId } });
      if (!m) return "";
      return `SOURCE: Meeting "${m.title}"\n\nTRANSCRIPT:\n${(m.transcript || "").slice(0, 8000)}\n\nSUMMARY:\n${(m.summary || "").slice(0, 4000)}\n\nACTION ITEMS:\n${(m.actionItems || "").slice(0, 2000)}`;
    }
    if (sourceType === "dataset") {
      const { overview, rows } = await loadDataset(userId, sourceId);
      const sample = rows.slice(0, 15).map((r) => JSON.stringify(r)).join("\n");
      const cols = overview.columnsInfo
        .map((c) => `${c.name} (${c.type}${c.type === "number" && c.min !== undefined ? `, mean ${c.mean?.toFixed(2)}` : ""})`)
        .join(", ");
      return `SOURCE: Dataset "${overview.originalName}"\nROWS: ${overview.rows}\nCOLUMNS: ${cols}\n\nSAMPLE ROWS:\n${sample}`;
    }
    if (sourceType === "file") {
      const f = await prisma.file.findFirst({ where: { id: sourceId, userId } });
      if (!f || !f.extractedText) return "";
      return `SOURCE: File "${f.originalName}"\n\nCONTENT:\n${f.extractedText.slice(0, 8000)}`;
    }
    if (sourceType === "conversation") {
      const conv = await prisma.conversation.findFirst({
        where: { id: sourceId, userId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
      });
      if (!conv) return "";
      const text = (conv.messages || [])
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content.slice(0, 500)}`)
        .join("\n\n");
      return `SOURCE: Conversation "${conv.title || "Chat"}"\n\n${text.slice(0, 10000)}`;
    }
    return "";
  } catch {
    return "";
  }
}

/* ---------- Generation ---------- */

export async function generateOutline(userId: string, topic: string, type: string): Promise<string> {
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a document architect. Return ONLY a markdown outline (headings + one-line descriptions) for the requested document type. Use ## for sections, ### for subsections.",
    },
    {
      role: "user" as const,
      content: `Document type: ${type}\nTopic: ${topic}\n\nReturn the outline as markdown headings only.`,
    },
  ];
  let full = "";
  for await (const chunk of streamWithFallback(messages, userId)) {
    full += chunk;
  }
  return full.trim().slice(0, 3000);
}

export async function* generateDocument(
  userId: string,
  topic: string,
  type: string,
  outline: string,
  context: string
): AsyncGenerator<string, void, unknown> {
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a professional document writer. Follow the outline exactly. Write complete, well-structured markdown. " +
        typeInstruction(type),
    },
    {
      role: "user" as const,
      content: [
        `Topic: ${topic}`,
        `Document type: ${type}`,
        "",
        "OUTLINE TO FOLLOW:",
        outline || "(create a sensible structure yourself)",
        context ? `\nREAL SOURCE MATERIAL TO INCORPORATE (facts must come from this; do not invent specifics):\n${context}` : "",
        "",
        "Write the full document now in markdown.",
      ].join("\n"),
    },
  ];
  yield* streamWithFallback(messages, userId);
}

/* ---------- CRUD + revisions ---------- */

export async function listDocuments(userId: string) {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getDocument(userId: string, id: string) {
  return prisma.document.findFirst({ where: { id, userId } });
}

export async function listRevisions(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (!doc) return null;
  return prisma.documentRevision.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function createDocument(
  userId: string,
  data: {
    title: string;
    type: string;
    content?: string;
    outline?: string;
    sourceType?: string | null;
    sourceId?: string | null;
    sourceName?: string | null;
  }
) {
  return prisma.document.create({
    data: {
      title: data.title.trim().slice(0, 200) || "Untitled document",
      type: data.type,
      content: data.content || "",
      outline: data.outline || null,
      sourceType: data.sourceType || null,
      sourceId: data.sourceId || null,
      sourceName: data.sourceName || null,
      userId,
    },
  });
}

/** Save content; snapshot the previous version as a real revision. */
export async function saveDocument(userId: string, id: string, content: string, title?: string) {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) return null;
  if (existing.content.trim() !== (content || "").trim()) {
    await prisma.documentRevision.create({
      data: { documentId: id, content: existing.content },
    });
  }
  return prisma.document.update({
    where: { id },
    data: {
      content,
      ...(title !== undefined ? { title: title.trim().slice(0, 200) || "Untitled document" } : {}),
    },
  });
}

export async function updateDocumentOutline(userId: string, id: string, outline: string) {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.document.update({ where: { id }, data: { outline } });
}

export async function deleteDocument(userId: string, id: string) {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.document.delete({ where: { id } });
}

/* ---------- Real exports ---------- */

/** Basic markdown → print-ready HTML (server-side, real content). */
export function markdownToHtml(markdown: string, title: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = markdown.split("\n");
  const out: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length) {
      out.push("<ul>" + list.map((li) => `<li>${li}</li>`).join("") + "</ul>");
      list = [];
    }
  };

  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushList();
      continue;
    }
    const h1 = line.match(/^# (.*)$/);
    const h2 = line.match(/^## (.*)$/);
    const h3 = line.match(/^### (.*)$/);
    const li = line.match(/^[-*] (.*)$/);
    if (h1) {
      flushList();
      out.push(`<h1>${inline(h1[1])}</h1>`);
    } else if (h2) {
      flushList();
      out.push(`<h2>${inline(h2[1])}</h2>`);
    } else if (h3) {
      flushList();
      out.push(`<h3>${inline(h3[1])}</h3>`);
    } else if (li) {
      list.push(inline(li[1]));
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();

  const body = out.join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; margin: 0; padding: 48px 24px; line-height: 1.7; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 2rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  h2 { font-size: 1.5rem; margin-top: 2rem; }
  h3 { font-size: 1.2rem; }
  a { color: #4f46e5; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  ul { padding-left: 1.5rem; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

/** Markdown → real .pptx (slide-ready structure). */
export async function markdownToPptx(
  markdown: string,
  title: string
): Promise<Buffer> {
  // Lazy require so the module only loads when actually exporting.
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const slides: Array<{ heading: string; level: number; bullets: string[]; paragraphs: string[] }> = [];
  let current: { heading: string; level: number; bullets: string[]; paragraphs: string[] } | null = null;
  const docTitle = title || markdown.match(/^# (.+)$/m)?.[1] || "Presentation";

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h1 = line.match(/^# (.*)$/);
    const h2 = line.match(/^## (.*)$/);
    const h3 = line.match(/^### (.*)$/);
    const li = line.match(/^[-*] (.*)$/);
    if (h1 && !current) continue; // title handled separately
    if (h2 || h3) {
      if (current) slides.push(current);
      current = { heading: (h2 || h3)![1], level: h2 ? 2 : 3, bullets: [], paragraphs: [] };
    } else if (li && current) {
      current.bullets.push(li[1]);
    } else if (current) {
      current.paragraphs.push(line);
    }
  }
  if (current) slides.push(current);

  // Title slide.
  const s0 = pptx.addSlide();
  s0.background = { color: "1E1B4B" };
  s0.addText(docTitle, { x: 0.6, y: 2.2, w: 12.1, h: 1.6, fontSize: 40, bold: true, color: "FFFFFF", align: "center" });
  s0.addText(`NexusAI Document Studio · ${new Date().toLocaleDateString()}`, {
    x: 0.6,
    y: 4.2,
    w: 12.1,
    h: 0.6,
    fontSize: 16,
    color: "C7D2FE",
    align: "center",
  });

  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(s.heading, { x: 0.5, y: 0.4, w: 12.3, h: 0.9, fontSize: 26, bold: true, color: "1E1B4B" });
    slide.addShape("line", { x: 0.5, y: 1.35, w: 12.3, h: 0.02, line: { color: "C7D2FE", width: 1.5 } });
    const bullets = s.bullets.length ? s.bullets : s.paragraphs.slice(0, 5);
    if (bullets.length) {
      slide.addText(
        bullets.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true } })),
        { x: 0.7, y: 1.7, w: 11.9, h: 5.2, fontSize: 16, color: "111827", valign: "top" }
      );
    } else {
      slide.addText("(This section has no body content.)", {
        x: 0.7,
        y: 1.7,
        w: 11.9,
        h: 0.6,
        fontSize: 14,
        color: "9CA3AF",
        italic: true,
      });
    }
  }

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

export const SOURCE_OPTIONS = [
  { id: "research", label: "Research session" },
  { id: "meeting", label: "Meeting" },
  { id: "dataset", label: "Dataset" },
  { id: "file", label: "File" },
  { id: "conversation", label: "Conversation" },
];
