import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bookmark, CornerDownLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import { getSavedPrompts, type SavedPrompt } from "@/utils/savedPrompts";

interface PromptPickerProps {
  open: boolean;
  onClose: () => void;
  onInsert: (prompt: string) => void;
  userId?: string;
}

/**
 * Keyboard-driven saved-prompt picker, anchored above the Chat composer.
 * Opens via Cmd/Ctrl+Shift+P; ↑↓ navigate, Enter inserts at the caret,
 * Esc closes. Reads the user's real saved prompts fresh on every open.
 */
export function PromptPicker({ open, onClose, onInsert, userId }: PromptPickerProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fresh read each time it opens; focus the panel for arrow-key navigation.
  useEffect(() => {
    if (open) {
      const list = userId ? getSavedPrompts(userId) : [];
      setPrompts(list);
      setHighlight(0);
      requestAnimationFrame(() => rootRef.current?.focus());
    }
  }, [open, userId]);

  // Close on outside click or Escape (matches the app's Select pattern).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const pick = (p: SavedPrompt) => onInsert(p.prompt);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, prompts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (prompts[highlight]) pick(prompts[highlight]);
    }
  };

  return (
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      role="listbox"
      aria-label="Saved prompts"
      aria-activedescendant={prompts[highlight] ? `prompt-option-${prompts[highlight].id}` : undefined}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-float outline-none"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-xs font-semibold">Insert saved prompt</span>
        <kbd className="ml-auto rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl/⌘ ⇧ P</kbd>
      </div>

      {prompts.length === 0 ? (
        <div className="px-3 py-5 text-center">
          <p className="text-xs text-muted-foreground">No saved prompts yet</p>
          <Link
            to="/memory"
            onClick={onClose}
            className="mt-1.5 inline-block text-xs font-medium text-primary transition-colors hover:underline"
          >
            Save one in AI Memory
          </Link>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto p-1">
          {prompts.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              id={`prompt-option-${p.id}`}
              aria-selected={i === highlight}
              onClick={() => pick(p)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                i === highlight ? "bg-primary/10" : "text-foreground"
              )}
            >
              <span className="text-xs font-medium">{p.title}</span>
              <span className="truncate text-[11px] text-muted-foreground">{p.prompt}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>↑↓ navigate · Enter insert · Esc close</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" /> inserts at caret
        </span>
      </div>
    </motion.div>
  );
}
