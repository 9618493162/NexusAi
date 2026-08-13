import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import {
  LayoutDashboard, MessageSquare, Bot, Image, Video, Mic, FileText, Brain, FolderKanban, Video as VideoCam, Workflow as WorkflowIcon, Database, Compass, FileText as DocIcon,
  History, Star, BarChart3, Settings, Search, CornerDownLeft, ArrowRight,
  Sparkles, TrendingUp,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { detectIntent } from "@/utils/intentRouter";
import { searchService, searchLocalImages, type SearchResult, type SearchResultType } from "@/services/search.service";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { openSearchResult } from "@/utils/openSearchResult";

const COMMANDS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", hint: "go" },
  { icon: MessageSquare, label: "New Chat", path: "/chat", hint: "go" },
  { icon: Bot, label: "Agents", path: "/agents", hint: "go" },
  { icon: Image, label: "Image Studio", path: "/image-studio", hint: "go" },
  { icon: Video, label: "Video Studio", path: "/video-studio", hint: "go" },
  { icon: Mic, label: "Voice", path: "/voice", hint: "go" },
  { icon: VideoCam, label: "Meetings", path: "/meetings", hint: "go" },
  { icon: WorkflowIcon, label: "Workflows", path: "/workflows", hint: "go" },
  { icon: Database, label: "Data Lab", path: "/data-lab", hint: "go" },
  { icon: Compass, label: "Research Studio", path: "/research", hint: "go" },
  { icon: TrendingUp, label: "Markets Studio", path: "/markets", hint: "go" },
  { icon: DocIcon, label: "Document Studio", path: "/documents", hint: "go" },
  { icon: FileText, label: "Files", path: "/files", hint: "go" },
  { icon: Brain, label: "AI Memory", path: "/memory", hint: "go" },
  { icon: FolderKanban, label: "Project Workspaces", path: "/projects", hint: "go" },
  { icon: History, label: "History", path: "/history", hint: "go" },
  { icon: Star, label: "Favorites", path: "/favorites", hint: "go" },
  { icon: BarChart3, label: "Analytics", path: "/analytics", hint: "go" },
  { icon: Settings, label: "Settings", path: "/settings", hint: "go" },
];

const GROUP_LABELS: Record<SearchResultType, string> = {
  conversation: "Conversations",
  message: "Messages",
  file: "Files",
  audio: "Audio",
  image: "Generated images",
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Item =
  | { kind: "nav"; command: (typeof COMMANDS)[number] }
  | { kind: "intent"; label: string; description: string; route: string }
  | { kind: "result"; result: SearchResult }
  | { kind: "viewall"; query: string };

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Free-text commands route by intent (e.g. "create an image of a dog" →
  // Image Studio with the prompt pre-filled); anything unrecognized becomes
  // a chat message. Navigation commands still work alongside it.
  const intentResult = useMemo(() => (query.trim() ? detectIntent(query) : null), [query]);
  const navResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  // Debounced real global search (no request per keystroke).
  const q = query.trim();
  useEffect(() => {
    if (!open || q.length < 2) {
      setSearchResults(null);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const { data } = await searchService.search(q);
        setSearchResults([...data.results, ...searchLocalImages(q)]);
      } catch {
        setSearchResults(null);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const grouped = useMemo(() => {
    if (!searchResults?.length) return [];
    const order: SearchResultType[] = ["conversation", "message", "file", "audio", "image"];
    return order
      .map((t) => ({ type: t, items: searchResults.filter((r) => r.type === t) }))
      .filter((g) => g.items.length > 0);
  }, [searchResults]);

  // Flat, keyboard-indexable list: nav commands → intent → search results → view-all.
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    if (intentResult) list.push({ kind: "intent", label: intentResult.label, description: intentResult.description, route: intentResult.route });
    for (const command of navResults) list.push({ kind: "nav", command });
    for (const group of grouped) for (const result of group.items) list.push({ kind: "result", result });
    if (searchResults?.length || q.length >= 2) list.push({ kind: "viewall", query: q });
    return list;
  }, [intentResult, navResults, grouped, searchResults, q]);

  // Reset state each time the palette opens, focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setSearchResults(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const runItem = (item: Item) => {
    onOpenChange(false);
    switch (item.kind) {
      case "intent":
        navigate(item.route);
        break;
      case "nav":
        navigate(item.command.path);
        break;
      case "result":
        openSearchResult(item.result, navigate);
        break;
      case "viewall":
        navigate(item.query ? `/search?q=${encodeURIComponent(item.query)}` : "/search");
        break;
    }
  };

  const run = (index: number) => {
    if (items[index]) runItem(items[index]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && items[selected]) {
      e.preventDefault();
      run(selected);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  let flatIndex = -1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open && (
        <Dialog.Portal forceMount>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md animate-fade-in" />
          <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:pt-[18vh]">
            <Dialog.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover spatial-pop"
                onKeyDown={onKeyDown}
              >
                <div className="flex items-center gap-3 border-b border-border px-4">
                  <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                    placeholder="Ask NexusAI, or search conversations, files, audio…"
                    aria-label="Universal command search"
                    className="h-13 w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      {q ? `No results for “${q}”` : "Type a command or search your data"}
                    </p>
                  ) : (
                    <>
                      {navResults.length > 0 && (
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pages</p>
                      )}
                      {items.map((item) => {
                        if (item.kind === "nav") {
                          flatIndex += 1;
                          const i = flatIndex;
                          const cmd = item.command;
                          return (
                            <button
                              key={`nav-${cmd.path}`}
                              onClick={() => run(i)}
                              onMouseEnter={() => setSelected(i)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                                i === selected ? "bg-primary/10 text-primary" : "text-foreground"
                              )}
                            >
                              <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                              <span className="flex-1 font-medium">{cmd.label}</span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                {cmd.hint}
                                {i === selected && <ArrowRight className="h-3 w-3" />}
                              </span>
                            </button>
                          );
                        }
                        if (item.kind === "intent") {
                          flatIndex += 1;
                          const i = flatIndex;
                          return (
                            <button
                              key="intent"
                              onClick={() => run(i)}
                              onMouseEnter={() => setSelected(i)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                                i === selected ? "bg-primary/10 text-primary" : "text-foreground"
                              )}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.8} />
                              </span>
                              <span className="flex-1">
                                <span className="block font-medium">{item.label}</span>
                                <span className="block text-xs text-muted-foreground">{item.description}</span>
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                run
                                {i === selected && <ArrowRight className="h-3 w-3" />}
                              </span>
                            </button>
                          );
                        }
                        if (item.kind === "result") {
                          flatIndex += 1;
                          const i = flatIndex;
                          return (
                            <div
                              key={`result-${item.result.type}-${item.result.id}`}
                              className={cn("group border-b border-border/40 first:border-t last:border-b-0", i === selected && "bg-primary/5")}
                            >
                              <SearchResultRow
                                result={item.result}
                                selected={i === selected}
                                onSelect={() => setSelected(i)}
                                onOpen={() => run(i)}
                              />
                            </div>
                          );
                        }
                        // viewall
                        flatIndex += 1;
                        const i = flatIndex;
                        return (
                          <button
                            key="viewall"
                            onClick={() => run(i)}
                            onMouseEnter={() => setSelected(i)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                              i === selected ? "bg-primary/10 text-primary" : "text-foreground"
                            )}
                          >
                            <span className="flex-1 font-medium">View all results{q ? ` for “${q}”` : ""}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              {i === selected && <ArrowRight className="h-3 w-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>

                {searchResults && searchResults.length > 0 && (
                  <div className="px-4 pt-1">
                    {grouped.map((g) => (
                      <span key={g.type} className="mr-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {GROUP_LABELS[g.type]} · {g.items.length}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> navigate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono"><CornerDownLeft className="inline h-2.5 w-2.5" /></kbd> run
                  </span>
                  <span className="hidden h-3 w-px bg-border sm:block" />
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">⌘K</kbd> palette
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">⌘N</kbd> new chat
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">⌘⇧M</kbd> dictation
                  </span>
                </div>
              </motion.div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
