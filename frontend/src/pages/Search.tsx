import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search as SearchIcon, X, Clock, MessageSquare, FileText, Mic, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { openSearchResult } from "@/utils/openSearchResult";
import { searchService, searchLocalImages, type SearchResult, type SearchResultType } from "@/services/search.service";
import { cn } from "@/utils/cn";

const RECENT_KEY = "nexusai-recent-searches";

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

function saveRecent(terms: string[]): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(terms.slice(0, 8))); } catch { /* ignore */ }
}

type Filter = "all" | "conversation" | "file" | "audio" | "image";

const FILTERS: Array<{ id: Filter; label: string; icon: React.ElementType }> = [
  { id: "all", label: "All", icon: SearchIcon },
  { id: "conversation", label: "Conversations", icon: MessageSquare },
  { id: "file", label: "Files", icon: FileText },
  { id: "audio", label: "Audio", icon: Mic },
  { id: "image", label: "Images", icon: ImageIcon },
];

const GROUP_LABELS: Record<SearchResultType, string> = {
  conversation: "Conversations",
  message: "Messages",
  file: "Files",
  audio: "Audio",
  image: "Generated images",
};

export function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();

  // Debounced search — no request per keystroke.
  useEffect(() => {
    if (!q) {
      setResults(null);
      setSearching(false);
      setError(false);
      return;
    }
    setSearching(true);
    setError(false);
    const t = window.setTimeout(async () => {
      try {
        const { data } = await searchService.search(q);
        // Merge the on-device image gallery (real local generations).
        const localImages = searchLocalImages(q);
        setResults([...data.results, ...localImages]);
      } catch {
        setError(true);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  // Keep ?q= in the URL so the page is shareable/reloadable.
  useEffect(() => {
    if (q) setSearchParams({ q }, { replace: true });
  }, [q, setSearchParams]);

  const visible = useMemo(() => {
    if (!results) return [];
    if (filter === "all") return results;
    if (filter === "conversation") return results.filter((r) => r.type === "conversation" || r.type === "message");
    return results.filter((r) => r.type === filter);
  }, [results, filter]);

  const grouped = useMemo(() => {
    const order: SearchResultType[] = ["conversation", "message", "file", "audio", "image"];
    return order
      .map((t) => ({ type: t, items: visible.filter((r) => r.type === t) }))
      .filter((g) => g.items.length > 0);
  }, [visible]);

  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Keyboard: ↑/↓ move, Enter opens, Esc clears.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, flatItems.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[selected];
      if (item) { remember(item); openSearchResult(item, navigate); }
    } else if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.focus();
    }
  };

  const remember = (result: SearchResult) => {
    setRecent((prev) => {
      const next = [result.title, ...prev.filter((t) => t.toLowerCase() !== result.title.toLowerCase())];
      saveRecent(next);
      return next;
    });
  };

  const runRecent = (term: string) => { setQuery(term); setSelected(0); };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader icon={SearchIcon} title="Search" description="Find anything across your NexusAI — conversations, files, audio and generations" />

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={onKeyDown}
          placeholder="Search conversations, files, audio…"
          aria-label="Search NexusAI"
          autoFocus
          className="h-13 w-full rounded-2xl border border-border bg-card py-3.5 pl-12 pr-11 text-[15px] shadow-card outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
        {q && (
          <button
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === id ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Body */}
      {!q ? (
        recent.length > 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Recent searches
              </h2>
              <button
                onClick={() => { setRecent([]); saveRecent([]); }}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((term) => (
                <button
                  key={term}
                  onClick={() => runRecent(term)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {term}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Type above to search your conversations, files, audio sessions and generated images.
          </p>
        )
      ) : searching && !results ? (
        <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching NexusAI…
        </p>
      ) : error ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Unable to search right now.</p>
          <button
            onClick={() => { setError(false); setSearching(true); searchService.search(q).then(({ data }) => setResults([...data.results, ...searchLocalImages(q)])).catch(() => setError(true)).finally(() => setSearching(false)); }}
            className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Try again
          </button>
        </div>
      ) : flatItems.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <SearchIcon className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">No results found</p>
          <p className="text-xs text-muted-foreground">Try a different search term.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map((group) => (
            <motion.section key={group.type} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {GROUP_LABELS[group.type]}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal">{group.items.length}</span>
              </h2>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                {group.items.map((item) => {
                  const flatIndex = flatItems.indexOf(item);
                  return (
                    <div key={item.id + item.type} className={cn("group border-b border-border/50 last:border-b-0", flatIndex === selected && "bg-primary/5")}>
                      <SearchResultRow
                        result={item}
                        selected={flatIndex === selected}
                        onSelect={() => setSelected(flatIndex)}
                        onOpen={() => { remember(item); openSearchResult(item, navigate); }}
                      />
                    </div>
                  );
                })}
              </div>
            </motion.section>
          ))}
          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> navigate · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd> open · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">esc</kbd> clear
          </p>
        </div>
      )}
    </div>
  );
}
