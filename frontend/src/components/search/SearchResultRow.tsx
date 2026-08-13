import { MessageSquare, FileText, Mic, Image as ImageIcon, ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import type { SearchResult, SearchResultType } from "@/services/search.service";

const TYPE_ICONS: Record<SearchResultType, React.ElementType> = {
  conversation: MessageSquare,
  message: MessageSquare,
  file: FileText,
  audio: Mic,
  image: ImageIcon,
};

const TYPE_STYLES: Record<SearchResultType, string> = {
  conversation: "bg-primary/10 text-primary",
  message: "bg-blue-500/10 text-blue-500",
  file: "bg-amber-500/10 text-amber-500",
  audio: "bg-emerald-500/10 text-emerald-500",
  image: "bg-fuchsia-500/10 text-fuchsia-500",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function metaLine(result: SearchResult): string {
  switch (result.type) {
    case "file":
      return [result.meta.mimeType?.split("/")[1]?.toUpperCase() || "FILE", result.meta.size ? formatBytes(result.meta.size) : null]
        .filter(Boolean)
        .join(" · ");
    case "audio":
      return `Voice · ${result.meta.sourceLang || "en"}${result.meta.targetLang && result.meta.targetLang !== result.meta.sourceLang ? ` → ${result.meta.targetLang}` : ""}`;
    case "conversation":
      return `Conversation${typeof result.meta.messageCount === "number" ? ` · ${result.meta.messageCount} messages` : ""}`;
    case "message":
      return `Message · ${result.meta.role === "user" ? "You" : "NexusAI"}`;
    case "image":
      return `Generated · ${result.meta.model || "image"}`;
    default:
      return "";
  }
}

interface SearchResultRowProps {
  result: SearchResult;
  selected?: boolean;
  onSelect?: () => void;
  onOpen: () => void;
}

export function SearchResultRow({ result, selected, onSelect, onOpen }: SearchResultRowProps) {
  const Icon = TYPE_ICONS[result.type];
  return (
    <button
      onClick={onOpen}
      onMouseEnter={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
        selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/60"
      )}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TYPE_STYLES[result.type])}>
        {result.type === "image" && result.meta.url ? (
          <img src={result.meta.url} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{result.title}</span>
          {result.type === "message" && result.meta.role === "user" && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">You</span>
          )}
        </span>
        {result.snippet && <span className="block truncate text-xs text-muted-foreground">{result.snippet}</span>}
        <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
          {metaLine(result)}
          {result.updatedAt ? ` · ${formatRelative(result.updatedAt)}` : ""}
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
