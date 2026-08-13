import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  searchable?: boolean;
  leadingIcon?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  searchable = false,
  leadingIcon,
  className,
  align = "left",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset search + highlight each time the list opens; focus search when present.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(Math.max(0, filtered.findIndex((o) => o.value === value)));
      requestAnimationFrame(() => {
        if (searchable) searchRef.current?.focus();
      });
    }
  }, [open]);

  // Keep the highlighted option visible while scrolling.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const pick = (opt: SelectOption) => {
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex w-full items-center gap-1.5 rounded-full border bg-card py-1 pl-2.5 pr-2 text-xs shadow-sm transition-colors",
          open
            ? "border-primary/50 ring-2 ring-primary/20"
            : "border-border hover:border-primary/40"
        )}
      >
        {leadingIcon}
        <span className="max-w-[160px] truncate font-medium text-foreground">
          {current ? current.label : placeholder}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-float",
            align === "right" ? "right-0" : "left-0"
          )}
        >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                  onKeyDown={onKeyDown}
                  placeholder="Filter..."
                  aria-label={`Filter ${ariaLabel.toLowerCase()}`}
                  className="h-9 w-full bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div
              ref={listRef}
              onKeyDown={onKeyDown}
              className="max-h-64 overflow-y-auto p-1"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</p>
              ) : (
                filtered.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-idx={i}
                    onClick={() => pick(opt)}
                    onMouseEnter={() => setHighlight(i)}
                    role="option"
                    aria-selected={opt.value === value}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                      i === highlight ? "bg-primary/10" : "text-foreground",
                      opt.value === value && "font-medium text-primary"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{opt.hint}</span>
                    )}
                    {opt.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                ))
              )}
            </div>
        </motion.div>
      )}
    </div>
  );
}
