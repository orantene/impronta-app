"use client";

import { useMemo, useState } from "react";
import type { DocsCardItem } from "@/components/docs/docs-card-grid";
import { DocsCardGrid } from "@/components/docs/docs-card-grid";
import { DocsSearchBar, type DocsSearchScope } from "@/components/docs/docs-search-bar";

function matchesScopes(card: DocsCardItem, q: string, scopes: DocsSearchScope[]): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const titleHit = card.title.toLowerCase().includes(lower);
  const descHit = card.description.toLowerCase().includes(lower);
  const kind = card.kind ?? "content";

  if (scopes.length === 0) return titleHit || descHit;

  return (
    (scopes.includes("sections") && titleHit) ||
    (scopes.includes("content") && descHit) ||
    (scopes.includes("tables") && kind === "table" && (titleHit || descHit))
  );
}

export function DocsOverviewClient({ cards }: { cards: DocsCardItem[] }) {
  const [query, setQuery] = useState("");
  const [scopes, setScopes] = useState<DocsSearchScope[]>(["sections", "tables", "content"]);

  const visible = useMemo(() => cards.filter((c) => matchesScopes(c, query, scopes)), [cards, query, scopes]);

  return (
    <div className="space-y-5">
      <DocsSearchBar value={query} onChange={setQuery} scopes={scopes} onScopesChange={setScopes} id="docs-hub-search" />
      {visible.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
          No topics match this search. Try another keyword or widen the filters.
        </p>
      ) : (
        <DocsCardGrid cards={visible} />
      )}
    </div>
  );
}
