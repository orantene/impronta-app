"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InspectorContext } from "@/lib/admin/admin-inspector/types";
import { formatMatchExplanationsForUi } from "@/lib/ai/match-explain";
import type { SearchResult } from "@/lib/ai/search-result";

function isAiSearchSurface(ctx: InspectorContext) {
  const p = ctx.pathname;
  return (
    p.startsWith("/admin/ai-workspace") ||
    p.startsWith("/admin/analytics/search")
  );
}

export function AiSearchRankingModule({ ctx }: { ctx: InspectorContext }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState<SearchResult | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFirst(null);
    try {
      const res = await fetch("/api/admin/ai/search-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, limit: 6, locale: "en" }),
      });
      const body = (await res.json()) as { results?: SearchResult[]; error?: string };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setFirst(body.results?.[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [q]);

  if (!isAiSearchSurface(ctx)) return null;

  const items = first ? formatMatchExplanationsForUi(first.explanation, "en") : [];

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[var(--admin-nav-idle)]">
        Explanations are produced by the same hybrid directory search used in match preview. Run a query to load real
        ranking reasons — nothing is shown until the API returns.
      </p>
      <div className="flex flex-col gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try a staff search query"
          className="h-9 text-xs"
          aria-label="Inspector search query"
        />
        <Button type="button" size="sm" variant="secondary" className="h-8 rounded-lg text-xs" disabled={loading} onClick={() => void run()}>
          {loading ? "Running…" : "Run staff search"}
        </Button>
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
      {items.length ? (
        <AIMatchExplanation className="text-[var(--admin-nav-idle)]" items={items} ariaLabel="Ranking explanation" />
      ) : first ? (
        <p className="text-[var(--admin-nav-idle)]">No explanation tokens on the top result.</p>
      ) : null}
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/ai-workspace/match-preview" scroll={false}>
          Full match preview UI
        </Link>
      </Button>
    </div>
  );
}

export function AiSearchRefineModule({ ctx }: { ctx: InspectorContext }) {
  if (!isAiSearchSurface(ctx)) return null;
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
      <li>Tighten taxonomy filters before widening text — vector recall follows structured filters.</li>
      <li>Try alternate city or locale slugs when classic matches empty out early.</li>
      <li>Compare classic-only vs hybrid using the debug payload on Match preview.</li>
    </ul>
  );
}

export function AiSearchHealthModule({ ctx }: { ctx: InspectorContext }) {
  if (!isAiSearchSurface(ctx)) return null;
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      <p>
        Staff diagnostics: <code className="rounded bg-[var(--admin-code-bg)] px-1">POST /api/admin/ai/search-debug</code>{" "}
        returns merge strategy, candidate counts, and timing. Production queries also surface in Analytics → AI / Search.
      </p>
      <div className="flex flex-col gap-2">
        <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
          <Link href="/admin/analytics/search" scroll={false}>
            Analytics · AI / Search
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
          <Link href="/admin/ai-workspace/console" scroll={false}>
            AI console
          </Link>
        </Button>
      </div>
    </div>
  );
}
