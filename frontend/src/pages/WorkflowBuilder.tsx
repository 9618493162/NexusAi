import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowUpRight, Copy, Download, List, Loader2, Maximize2,
  Minus, Plus, Play, Save, Workflow as WorkflowIcon, X, Zap,
} from "lucide-react";
import { workflowsService, WorkflowRun } from "@/services/workflows.service";
import { fileService } from "@/services/file.service";
import { NODE_TYPES, NODE_CATEGORIES, nodeMeta, newNode, makeEdgeId, validateGraph, DEFAULT_MODEL } from "@/utils/workflowNodes";
import { WorkflowNode, WorkflowEdge } from "@/services/workflows.service";
import { SpatialEnvironment } from "@/components/ui/spatial-environment";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

const NODE_W = 210;
const NODE_H = 76;
const COND_H = 92;

interface NodeStatus {
  status: "idle" | "running" | "completed" | "failed" | "skipped";
  summary?: string;
  error?: string;
}

interface RunEvent {
  type: string;
  nodeId?: string;
  nodeType?: string;
  status?: string;
  summary?: string;
  error?: string;
  message?: string;
  runId?: string;
}

function portY(node: WorkflowNode, port: string): number {
  const h = node.type === "condition" ? COND_H : NODE_H;
  if (node.type === "condition") return port === "true" ? node.y + 28 : node.y + 48;
  return node.y + h / 2;
}

export function WorkflowBuilder() {
  const { id = "" } = useParams();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Array<{ id: string; originalName: string; mimeType: string }>>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingConnect, setPendingConnect] = useState<{ from: string; fromPort: string } | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState({ x: 40, y: 40, scale: 1 });
  const [listView, setListView] = useState(false);

  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<Array<{ nodeId: string; label: string; text: string; kind: string }>>([]);
  const [runResult, setRunResult] = useState<WorkflowRun | null>(null);
  const [runErrors, setRunErrors] = useState<string[]>([]);
  const [showRunPanel, setShowRunPanel] = useState(false);

  const dragRef = useRef<{ type: "node" | "pan"; id?: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const pendingConnectRef = useRef(pendingConnect);
  pendingConnectRef.current = pendingConnect;
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const load = useCallback(async () => {
    try {
      const { data } = await workflowsService.get(id);
      setName(data.workflow.name);
      setDescription(data.workflow.description || "");
      setNodes(Array.isArray(data.workflow.nodes) ? data.workflow.nodes : []);
      setEdges(Array.isArray(data.workflow.edges) ? data.workflow.edges : []);
      setDirty(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Workflow not found.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fileService
      .getFiles()
      .then(({ data }) => setFiles(data.map((f: any) => ({ id: f.id, originalName: f.originalName, mimeType: f.mimeType }))))
      .catch(() => {});
  }, []);

  const validationErrors = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const markDirty = () => setDirty(true);

  /* ── Graph mutations ─────────────────────────────────────────────── */

  const addNode = (type: string) => {
    const base = { x: 60 + Math.random() * 120, y: 60 + Math.random() * 80 };
    const n = newNode(type, Math.round(base.x), Math.round(base.y));
    setNodes((prev) => [...prev, n]);
    setSelectedNodeId(n.id);
    setSelectedEdgeId(null);
    markDirty();
    setView((v) => ({ ...v, x: 40, y: 40 }));
  };

  const updateNodeConfig = (nodeId: string, config: Record<string, any>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, config } : n)));
    markDirty();
  };

  const removeNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (pendingConnect?.from === nodeId) setPendingConnect(null);
    markDirty();
  };

  const removeEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    markDirty();
  };

  const startConnect = (from: string, fromPort: string) => {
    setPendingConnect({ from, fromPort });
    setSelectedEdgeId(null);
  };

  const finishConnect = (to: string) => {
    const pending = pendingConnectRef.current;
    if (!pending) return;
    const fromNode = nodesRef.current.find((n) => n.id === pending.from);
    if (pending.from === to || !fromNode) {
      setPendingConnect(null);
      return;
    }
    const exists = edgesRef.current.some((e) => e.from === pending.from && e.fromPort === pending.fromPort && e.to === to);
    if (!exists) {
      setEdges((prev) => [...prev, { id: makeEdgeId(), from: pending.from, fromPort: pending.fromPort, to }]);
      markDirty();
    }
    setPendingConnect(null);
  };

  /* ── Canvas interaction ──────────────────────────────────────────── */

  const toCanvas = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };

  const onPointerDown = (e: React.PointerEvent, kind: "node" | "pan", nodeId?: string) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (kind === "node" && nodeId) {
      const node = nodesRef.current.find((n) => n.id === nodeId)!;
      dragRef.current = { type: "node", id: nodeId, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y };
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
    } else {
      dragRef.current = { type: "pan", startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag) {
      if (drag.type === "node" && drag.id) {
        const dx = (e.clientX - drag.startX) / view.scale;
        const dy = (e.clientY - drag.startY) / view.scale;
        setNodes((prev) => prev.map((n) => (n.id === drag.id ? { ...n, x: Math.round(drag.origX + dx), y: Math.round(drag.origY + dy) } : n)));
        markDirty();
      } else {
        setView((v) => ({ ...v, x: drag.origX + (e.clientX - drag.startX), y: drag.origY + (e.clientY - drag.startY) }));
      }
    }
    if (pendingConnect) {
      const p = toCanvas(e.clientX, e.clientY);
      setPointerPos(p);
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, scale: Math.min(2, Math.max(0.4, v.scale * (e.deltaY < 0 ? 1.08 : 0.92))) }));
  };

  const fitView = () => {
    if (nodes.length === 0) {
      setView({ x: 40, y: 40, scale: 1 });
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.x)) - 40;
    const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_W + 40;
    const minY = Math.min(...nodes.map((n) => n.y)) - 40;
    const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H + 40;
    const vw = canvasRef.current?.clientWidth || 800;
    const vh = canvasRef.current?.clientHeight || 500;
    const scale = Math.min(1.2, Math.max(0.4, Math.min(vw / (maxX - minX), vh / (maxY - minY))));
    setView({ x: (vw - (maxX - minX) * scale) / 2 - minX * scale, y: (vh - (maxY - minY) * scale) / 2 - minY * scale, scale });
  };

  // Keyboard: Delete removes selection, Escape cancels connect/deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) { removeNode(selectedNodeId); }
        else if (selectedEdgeId) { removeEdge(selectedEdgeId); }
      } else if (e.key === "Escape") {
        if (pendingConnect) setPendingConnect(null);
        else { setSelectedNodeId(null); setSelectedEdgeId(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeId, selectedEdgeId, pendingConnect]);

  /* ── Save + Run ──────────────────────────────────────────────────── */

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError("");
    try {
      await workflowsService.update(id, { name: name.trim() || "Untitled workflow", description, nodes, edges });
      setDirty(false);
      return true;
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not save the workflow.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, name, description, nodes, edges]);

  const run = async () => {
    setError("");
    setRunErrors([]);
    setNodeStatuses({});
    setRunLog([]);
    setRunResult(null);
    setShowRunPanel(true);
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    if (validationErrors.length > 0) {
      setRunErrors(validationErrors);
      return;
    }
    setRunning(true);
    try {
      const response = await workflowsService.run(id);
      if (!response.ok) {
        let msg = "Workflow cannot run.";
        try {
          const body = await response.json();
          msg = body?.details?.length ? body.details.join(" · ") : body?.error || msg;
        } catch { /* not json */ }
        setRunErrors([msg]);
        setRunning(false);
        return;
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as RunEvent;
            if (ev.type === "node:started" && ev.nodeId) {
              setNodeStatuses((prev) => ({ ...prev, [ev.nodeId!]: { status: "running" } }));
              setRunLog((prev) => [...prev, { nodeId: ev.nodeId!, label: nodeMeta(ev.nodeType || "")?.label || ev.nodeType || "", text: "Started", kind: "start" }]);
            } else if (ev.type === "node:completed" && ev.nodeId) {
              setNodeStatuses((prev) => ({ ...prev, [ev.nodeId!]: { status: "completed", summary: ev.summary } }));
              setRunLog((prev) => [...prev, { nodeId: ev.nodeId!, label: nodeMeta(ev.nodeType || "")?.label || ev.nodeType || "", text: ev.summary || "Completed", kind: "done" }]);
            } else if (ev.type === "node:failed" && ev.nodeId) {
              setNodeStatuses((prev) => ({ ...prev, [ev.nodeId!]: { status: "failed", error: ev.error } }));
              setRunLog((prev) => [...prev, { nodeId: ev.nodeId!, label: nodeMeta(ev.nodeType || "")?.label || ev.nodeType || "", text: ev.error || "Failed", kind: "fail" }]);
            } else if (ev.type === "node:skipped" && ev.nodeId) {
              setNodeStatuses((prev) => ({ ...prev, [ev.nodeId!]: { status: "skipped" } }));
              setRunLog((prev) => [...prev, { nodeId: ev.nodeId!, label: nodeMeta(ev.nodeType || "")?.label || ev.nodeType || "", text: "Skipped — branch not taken", kind: "skip" }]);
            } else if (ev.type === "run:saved" && ev.runId) {
              const { data } = await workflowsService.listRuns(id);
              setRunResult(data.runs.find((r) => r.id === ev.runId) || data.runs[0] || null);
            }
          } catch { /* partial frame */ }
        }
      }
      if (!runResult) {
        const { data } = await workflowsService.listRuns(id);
        setRunResult(data.runs[0] || null);
      }
    } catch (err: any) {
      setError(err?.message || "Could not run the workflow.");
    } finally {
      setRunning(false);
    }
  };

  const exportResult = (format: "txt" | "json") => {
    if (!runResult) return;
    const content = format === "json" ? JSON.stringify(runResult, null, 2) : (runResult.result || "");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "workflow"}-run.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* ── Derived geometry for edges ──────────────────────────────────── */

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edgePaths = useMemo(() => {
    const toScreen = (x: number, y: number) => ({ x: x * view.scale + view.x, y: y * view.scale + view.y });
    return edges
      .map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        const x1 = toScreen(from.x + NODE_W, portY(from, e.fromPort));
        const x2 = toScreen(to.x, portY(to, "in"));
        const bend = Math.max(30, Math.abs(x2.x - x1.x) / 2);
        return {
          id: e.id,
          d: `M ${x1.x} ${x1.y} C ${x1.x + bend} ${x1.y}, ${x2.x - bend} ${x2.y}, ${x2.x} ${x2.y}`,
          active: nodeStatuses[e.from]?.status === "completed" || nodeStatuses[e.from]?.status === "running",
        };
      })
      .filter((p): p is { id: string; d: string; active: boolean } => !!p);
  }, [edges, nodeById, view, nodeStatuses]);

  if (loading) {
    return (
      <div className="relative min-h-full">
        <SpatialEnvironment />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <div className="mt-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        </div>
      </div>
    );
  }

  const statusDot = (status?: string) =>
    status === "running" ? "bg-blue-500 animate-pulse" : status === "completed" ? "bg-emerald-500" : status === "failed" ? "bg-red-500" : status === "skipped" ? "bg-muted-foreground/40" : "bg-border";

  return (
    <div className="relative flex min-h-full flex-col">
      <SpatialEnvironment />
      {/* Toolbar */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/60 px-4 py-2.5 backdrop-blur">
        <Link to="/workflows" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent" aria-label="Back to workflows">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <WorkflowIcon className="ml-1 h-4 w-4 text-violet-500" />
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          aria-label="Workflow name"
          className="w-44 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none transition-colors hover:border-border focus:border-primary/60 sm:w-64"
        />
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          {nodes.length} nodes · {edges.length} connections {dirty && "· unsaved"}
        </span>
        <select
          value=""
          onChange={(e) => { if (e.target.value) addNode(e.target.value); e.target.value = ""; }}
          aria-label="Add a node"
          className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none transition-colors hover:border-primary/40 focus:border-primary/60"
        >
          <option value="" disabled>+ Add node…</option>
          {NODE_TYPES.map((t) => (
            <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setListView((v) => !v)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors", listView ? "border-primary/50 bg-primary/10 text-primary" : "border-border hover:bg-accent")} title="List / canvas view" aria-label="Toggle list view">
            <List className="h-4 w-4" />
          </button>
          <button onClick={fitView} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent" title="Fit to screen" aria-label="Fit to screen">
            <Maximize2 className="h-4 w-4" />
          </button>
          <button onClick={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale - 0.15) }))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent" aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.scale * 100)}%</span>
          <button onClick={() => setView((v) => ({ ...v, scale: Math.min(2, v.scale + 0.15) }))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-accent" aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={run}
            disabled={running}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {error && (
        <div className="relative z-10 mx-4 mt-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-sm text-destructive">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
          <span>{error}</span>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* Palette */}
        <aside className="hidden w-44 shrink-0 overflow-y-auto border-r border-border/60 bg-card/40 p-2.5 backdrop-blur lg:block" aria-label="Node palette">
          <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add a node</p>
          {(["input", "ai", "voice", "create", "data", "logic", "output"] as const).map((cat) => (
            <div key={cat} className="mb-2">
              <p className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{NODE_CATEGORIES[cat].label}</p>
              {NODE_TYPES.filter((t) => t.category === cat).map((t) => (
                <button
                  key={t.type}
                  onClick={() => addNode(t.type)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                >
                  <span className="text-sm">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.label}</span>
                    <span className="block truncate text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Canvas or list view */}
        {listView ? (
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Workflow steps</h2>
            <div className="space-y-2">
              {nodes.map((n) => {
                const meta = nodeMeta(n.type)!;
                const cat = NODE_CATEGORIES[meta.category];
                const status = nodeStatuses[n.id];
                return (
                  <div key={n.id} className="card-surface flex items-center gap-3 p-3">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-base", cat.bg)}>{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{describeConfig(n)}</p>
                    </div>
                    <span className={cn("h-2.5 w-2.5 rounded-full", statusDot(status?.status))} title={status?.status || "idle"} />
                  </div>
                );
              })}
              {edges.map((e) => {
                const from = nodes.find((n) => n.id === e.from);
                const to = nodes.find((n) => n.id === e.to);
                const fromLabel = from ? nodeMeta(from.type)?.label : "?";
                const toLabel = to ? nodeMeta(to.type)?.label : "?";
                return (
                  <p key={e.id} className="flex items-center gap-2 pl-12 text-xs text-muted-foreground">
                    <ArrowUpRight className="h-3 w-3" />
                    {fromLabel} {e.fromPort !== "out" && <span className="text-amber-500">{e.fromPort}</span>} → {toLabel}
                  </p>
                );
              })}
              {nodes.length === 0 && <p className="text-xs text-muted-foreground">No nodes yet — add some from the palette.</p>}
            </div>
            <div className="mt-5 rounded-xl border border-dashed border-border bg-card/30 p-4 text-xs text-muted-foreground">
              This list view is the accessible, keyboard-friendly representation of the same graph — the canvas below edits the identical nodes and connections.
            </div>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative min-w-0 flex-1 touch-none overflow-hidden"
            onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas) onPointerDown(e, "pan"); }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
            role="application"
            aria-label="Workflow canvas — drag nodes, click output ports then input ports to connect"
          >
            {/* Grid */}
            <div
              data-canvas
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle, rgb(148 163 184 / 0.22) 1px, transparent 1px)",
                backgroundSize: `${22 * view.scale}px ${22 * view.scale}px`,
                backgroundPosition: `${view.x}px ${view.y}px`,
              }}
            />
            {/* Edges */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {edgePaths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={selectedEdgeId === p.id ? "rgb(139 92 246)" : p.active ? "rgb(16 185 129)" : "rgb(148 163 184 / 0.55)"}
                  strokeWidth={selectedEdgeId === p.id ? 2.5 : 2}
                  strokeDasharray={p.active ? "6 4" : undefined}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(p.id); setSelectedNodeId(null); }}
                />
              ))}
              {pendingConnect && pointerPos && (() => {
                const from = nodeById.get(pendingConnect.from);
                if (!from) return null;
                const x1 = from.x * view.scale + view.x + NODE_W * view.scale;
                const y1 = portY(from, pendingConnect.fromPort) * view.scale + view.y;
                return <path d={`M ${x1} ${y1} L ${pointerPos.x} ${pointerPos.y}`} fill="none" stroke="rgb(139 92 246)" strokeWidth={1.5} strokeDasharray="5 4" />;
              })()}
            </svg>
            {/* Nodes */}
            <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}>
              {nodes.map((n) => {
                const meta = nodeMeta(n.type)!;
                const cat = NODE_CATEGORIES[meta.category];
                const status = nodeStatuses[n.id];
                const isCondition = n.type === "condition";
                const h = isCondition ? COND_H : NODE_H;
                const selected = selectedNodeId === n.id;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "absolute select-none rounded-xl border bg-card/95 shadow-popover backdrop-blur transition-shadow",
                      selected ? "border-violet-400/70 ring-2 ring-violet-500/30" : "border-border/80",
                      status?.status === "running" && "border-blue-400/60",
                      status?.status === "completed" && "border-emerald-500/50",
                      status?.status === "failed" && "border-red-500/60",
                      status?.status === "skipped" && "opacity-50"
                    )}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: h }}
                  >
                    <div
                      className="flex cursor-grab items-center gap-2 px-3 pt-2.5 active:cursor-grabbing"
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, "node", n.id); }}
                      title="Drag to move"
                    >
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-sm", cat.bg)}>{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{meta.label}</p>
                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(status?.status))} />
                          {status?.status === "running" ? "Running…" : status?.status === "completed" ? "Completed" : status?.status === "failed" ? "Failed" : status?.status === "skipped" ? "Skipped" : "Idle"}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeNode(n.id); }}
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                        aria-label={`Delete ${meta.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="px-3 pt-1 text-[10px] leading-tight text-muted-foreground">{describeConfig(n)}</p>
                    {/* Input port */}
                    <button
                      onClick={(e) => { e.stopPropagation(); finishConnect(n.id); }}
                      className="absolute left-0 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card bg-muted-foreground/50 transition-colors hover:bg-violet-500"
                      style={{ top: h / 2 }}
                      title={pendingConnect ? "Connect here" : "Input"}
                      aria-label={`Connect into ${meta.label}`}
                    />
                    {/* Output ports */}
                    {meta.ports.map((p) => {
                      const top = isCondition ? (p === "true" ? 26 : 48) : 0;
                      return (
                        <button
                          key={p}
                          onClick={(e) => { e.stopPropagation(); startConnect(n.id, p); }}
                          className={cn("absolute right-0 flex h-4 w-4 translate-x-1/2 items-center justify-center rounded-full border-2 border-card transition-colors hover:bg-violet-500", pendingConnect?.from === n.id && pendingConnect.fromPort === p ? "bg-violet-500" : "bg-muted-foreground/50")}
                          style={{ top: h / 2 + (top === 0 ? 0 : top - h / 2) }}
                          title={p === "true" ? "Connect when true" : p === "false" ? "Connect when false" : "Output"}
                          aria-label={`${meta.label} ${p === "out" ? "output" : p} port`}
                        />
                      );
                    })}
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 pr-4 text-[10px] font-medium" style={{ marginTop: isCondition ? 12 : 0 }}>
                      {selected && <span className="text-muted-foreground/50">{meta.ports.length ? "● →" : "→"}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Hint */}
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-[10px] text-muted-foreground backdrop-blur">
              Drag to move · click output ● then input ● to connect · wheel to zoom · Delete removes
            </p>
          </div>
        )}

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            files={files}
            onChange={(config) => updateNodeConfig(selectedNode.id, config)}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Validation errors */}
      {!running && validationErrors.length > 0 && !listView && (
        <div className="relative z-10 mx-4 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">
          <span className="font-semibold">Workflow cannot run:</span> {validationErrors.join(" · ")}
        </div>
      )}

      {/* Run panel */}
      {(showRunPanel || runResult) && (
        <div className="relative z-20 border-t border-border/70 bg-card/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Workflow run
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </span>
            {runErrors.length > 0 && <span className="text-xs text-red-500">{runErrors.join(" · ")}</span>}
            {runResult?.status === "completed" && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">completed</span>}
            {runResult?.status === "failed" && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">failed</span>}
            <div className="ml-auto flex items-center gap-2">
              {runResult?.status === "completed" && runResult.result && (
                <>
                  <button onClick={() => navigator.clipboard?.writeText(runResult.result || "")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent" title="Copy result">
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button onClick={() => exportResult("txt")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent">
                    <Download className="h-3 w-3" /> .txt
                  </button>
                  <button onClick={() => exportResult("json")} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent">
                    <Download className="h-3 w-3" /> .json
                  </button>
                </>
              )}
              <button onClick={() => setShowRunPanel(false)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent" aria-label="Close run panel">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto border-t border-border/50">
            <div className="mx-auto grid max-w-6xl gap-4 px-4 py-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Execution log</p>
                {runLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{running ? "Executing…" : "Run the workflow to see each node execute for real."}</p>
                ) : (
                  <ul className="space-y-1">
                    {runLog.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", item.kind === "done" ? "bg-emerald-500" : item.kind === "fail" ? "bg-red-500" : item.kind === "skip" ? "bg-muted-foreground/40" : "bg-blue-500 animate-pulse")} />
                        <span className="min-w-0">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-muted-foreground"> — {item.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Result</p>
                {runResult ? (
                  <div className="space-y-2">
                    {runResult.outputs && Object.entries(runResult.outputs).map(([nodeId, out]: [string, any]) => {
                      if (out.type === "image") {
                        return (
                          <a key={nodeId} href={out.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-primary hover:bg-muted/40">
                            🖼️ Generated image <ArrowUpRight className="h-3 w-3" />
                          </a>
                        );
                      }
                      if (out.type === "magicslides") {
                        return (
                          <div key={nodeId} className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs">
                            <span className="font-medium text-violet-500">📊 {out.topic || "Presentation deck"}</span>
                            {out.url && (
                              <a href={out.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 py-1 font-medium text-violet-600 transition-colors hover:bg-violet-500/25 dark:text-violet-400">
                                Open deck <ArrowUpRight className="h-3 w-3" />
                              </a>
                            )}
                            {out.pdfUrl && (
                              <a href={out.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary-hover">
                                Download PDF <ArrowUpRight className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        );
                      }
                      if (out.type === "markets") {
                        const news = Array.isArray(out.news) ? out.news : [];
                        const tickers = Array.isArray(out.tickers) ? out.tickers : [];
                        return (
                          <div key={nodeId} className="space-y-1.5 rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-xs">
                            <p className="font-medium text-teal-600 dark:text-teal-400">
                              📈 Market data{tickers.length ? ` — ${tickers.join(", ")}` : ""}
                            </p>
                            {news.slice(0, 3).map((n: any, i: number) => (
                              <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
                                {n.articleUrl ? (
                                  <a href={n.articleUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-teal-600 transition-colors hover:underline dark:text-teal-400">
                                    <span className="truncate">{n.title}</span> <ArrowUpRight className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="truncate">{n.title}</span>
                                )}
                                {n.sentiment && <span className="shrink-0 text-[10px] text-muted-foreground/70">[{n.sentiment}]</span>}
                              </p>
                            ))}
                            {news.length === 0 && <p className="text-muted-foreground">Ticker data fetched (no free-tier news available).</p>}
                          </div>
                        );
                      }
                      if (out.type === "tts") {
                        return (
                          <audio key={nodeId} controls preload="none" className="h-9 w-full" src={workflowsService.audioUrl(runResult.id, nodeId)}>
                            Generated speech
                          </audio>
                        );
                      }
                      return null;
                    })}
                    {runResult.result ? (
                      <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed">{runResult.result}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{runResult.status === "failed" ? runResult.error : "No text result."}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{running ? "Waiting for the first node…" : "Run the workflow to see the real output."}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describeConfig(n: WorkflowNode): string {
  const cfg = n.config || {};
  switch (n.type) {
    case "text": return cfg.value ? String(cfg.value).slice(0, 40) : "empty";
    case "file": return cfg.fileName || (cfg.fileId ? "file selected" : "no file");
    case "audio": return cfg.fileName || (cfg.fileId ? "audio selected" : "no audio");
    case "ai": return cfg.prompt ? `“${String(cfg.prompt).slice(0, 36)}”` : "prompt…";
    case "translate": return `→ ${cfg.target || "?"}`;
    case "transcribe": return cfg.language ? `lang ${cfg.language}` : "auto language";
    case "tts": return cfg.voice ? `voice ${cfg.voice}` : "default voice";
    case "image": case "video": return cfg.prompt ? `“${String(cfg.prompt).slice(0, 36)}”` : "prompt…";
    case "magicslides": return cfg.topic ? `deck: ${String(cfg.topic).slice(0, 36)}` : `deck from incoming text${cfg.slideCount ? ` (${cfg.slideCount} slides)` : ""}`;
    case "markets": return "detects tickers in the incoming text";
    case "condition": {
      const mode = cfg.mode || "contains";
      return `${mode}${cfg.value ? ` “${String(cfg.value).slice(0, 16)}”` : ""}`;
    }
    default: return nodeMeta(n.type)?.description || "";
  }
}

function NodeConfigPanel({ node, files, onChange, onClose }: {
  node: WorkflowNode;
  files: Array<{ id: string; originalName: string; mimeType: string }>;
  onChange: (config: Record<string, any>) => void;
  onClose: () => void;
}) {
  const meta = nodeMeta(node.type)!;
  const cat = NODE_CATEGORIES[meta.category];
  const cfg = node.config || {};
  const set = (patch: Record<string, any>) => onChange({ ...cfg, ...patch });
  const audioFiles = files.filter((f) => /audio/i.test(f.mimeType));
  const pickFile = (fileId: string) => {
    const f = files.find((x) => x.id === fileId);
    set({ fileId, ...(f ? { fileName: f.originalName } : {}) });
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="relative z-20 w-full shrink-0 border-t border-border/60 bg-card/80 p-4 backdrop-blur lg:w-72 lg:border-l lg:border-t-0"
      aria-label={`Configure ${meta.label}`}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-base", cat.bg)}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="text-[10px] text-muted-foreground">{cat.label} · {node.id}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent" aria-label="Close config">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-2.5 text-sm">
        {node.type === "text" && (
          <textarea
            value={cfg.value || ""}
            onChange={(e) => set({ value: e.target.value })}
            placeholder="Text to feed the workflow…"
            rows={4}
            className="w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          />
        )}
        {(node.type === "file" || node.type === "audio") && (
          <select
            value={cfg.fileId || ""}
            onChange={(e) => pickFile(e.target.value)}
            className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          >
            <option value="">{node.type === "audio" ? "Select an audio file…" : "Select a file…"}</option>
            {(node.type === "audio" ? audioFiles : files).map((f) => (
              <option key={f.id} value={f.id}>{f.originalName}</option>
            ))}
          </select>
        )}
        {(node.type === "ai" || node.type === "image" || node.type === "video") && (
          <>
            <textarea
              value={cfg.prompt || ""}
              onChange={(e) => set({ prompt: e.target.value })}
              placeholder={node.type === "ai" ? 'Prompt — use {{input}} for the incoming value' : "Prompt…"}
              rows={node.type === "ai" ? 4 : 3}
              className="w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
            <input
              value={cfg.model || ""}
              onChange={(e) => set({ model: e.target.value })}
              placeholder={`Model (default ${DEFAULT_MODEL})`}
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </>
        )}
        {node.type === "translate" && (
          <>
            <input
              value={cfg.target || ""}
              onChange={(e) => set({ target: e.target.value })}
              placeholder="Target language (e.g. Hindi, Telugu, French)"
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
            <input
              value={cfg.source || ""}
              onChange={(e) => set({ source: e.target.value })}
              placeholder="Source language (optional)"
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </>
        )}
        {node.type === "transcribe" && (
          <input
            value={cfg.language || ""}
            onChange={(e) => set({ language: e.target.value })}
            placeholder="Language code (e.g. en, te, hi — optional)"
            className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          />
        )}
        {node.type === "tts" && (
          <input
            value={cfg.voice || ""}
            onChange={(e) => set({ voice: e.target.value })}
            placeholder="Voice id (optional — default voice)"
            className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          />
        )}
        {node.type === "magicslides" && (
          <>
            <input
              value={cfg.topic || ""}
              onChange={(e) => set({ topic: e.target.value })}
              placeholder="Deck title (optional — uses the incoming text)"
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
            <input
              type="number"
              min={4}
              max={20}
              value={cfg.slideCount || 8}
              onChange={(e) => set({ slideCount: Number(e.target.value) || 8 })}
              placeholder="Slide count (default 8)"
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            />
            <p className="text-xs text-muted-foreground">Calls the MagicSlides API with the incoming text — returns real PPTX + PDF download links that flow downstream (needs the account key in the backend .env).</p>
          </>
        )}
        {node.type === "markets" && (
          <p className="text-xs text-muted-foreground">Detects stock tickers in the incoming text (e.g. AAPL, TSLA) and fetches real Massive.com market data — ticker details, news, and dividends. No configuration needed; the fetched data flows downstream as text.</p>
        )}
        {node.type === "summarize" && (
          <input
            value={cfg.model || ""}
            onChange={(e) => set({ model: e.target.value })}
            placeholder={`Model (default ${DEFAULT_MODEL})`}
            className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          />
        )}
        {node.type === "condition" && (
          <>
            <select
              value={cfg.mode || "contains"}
              onChange={(e) => set({ mode: e.target.value })}
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="length_gte">length ≥</option>
              <option value="not_empty">is not empty</option>
            </select>
            {cfg.mode !== "not_empty" && (
              <input
                value={cfg.value ?? ""}
                onChange={(e) => set({ value: e.target.value })}
                placeholder={cfg.mode === "length_gte" ? "Minimum length" : "Text to compare"}
                className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
              />
            )}
          </>
        )}
        {node.type === "output" && (
          <p className="text-xs text-muted-foreground">This node's input becomes the workflow's final result — shown here, copyable, and exportable as .txt or .json.</p>
        )}
        {node.type === "analyze" && (
          <input
            value={cfg.model || ""}
            onChange={(e) => set({ model: e.target.value })}
            placeholder={`Model (default ${DEFAULT_MODEL})`}
            className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60"
          />
        )}
      </div>
    </motion.aside>
  );
}
