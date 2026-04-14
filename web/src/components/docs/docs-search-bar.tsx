"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";

export type DocsSearchScope = "sections" | "tables" | "content";

const SCOPE_LABELS: Record<DocsSearchScope, string> = {
  sections: "Sections",
  tables: "Tables",
  content: "Content",
};

export function DocsSearchBar({
  value,
  onChange,
  scopes,
  onScopesChange,
  placeholder = "Search docs…",
  className,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  scopes: DocsSearchScope[];
  onScopesChange: (next: DocsSearchScope[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  function toggle(scope: DocsSearchScope) {
    const has = scopes.includes(scope);
    if (has) {
      const next = scopes.filter((s) => s !== scope);
      onScopesChange(next.length ? next : (["sections", "tables", "content"] as DocsSearchScope[]));
    } else {
      onScopesChange([...scopes, scope]);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(ADMIN_FORM_CONTROL, "h-10 pl-9")}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Filter</span>
        {(Object.keys(SCOPE_LABELS) as DocsSearchScope[]).map((scope) => {
          const on = scopes.includes(scope);
          return (
            <button
              key={scope}
              type="button"
              onClick={() => toggle(scope)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                on
                  ? "border-[var(--impronta-gold-border)]/55 bg-[var(--impronta-gold)]/10 text-foreground shadow-sm"
                  : "border-border/55 bg-background/60 text-muted-foreground hover:border-[var(--impronta-gold-border)]/40 hover:text-foreground",
              )}
            >
              {SCOPE_LABELS[scope]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
