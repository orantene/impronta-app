import Link from "next/link";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import type { AiSearchMetricsWindow, AiTuningEnvSnapshot } from "@/lib/ai/ai-console-metrics";

function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function MetricsWindowCard({ w }: { w: AiSearchMetricsWindow }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <h3 className="text-sm font-medium text-foreground">{w.label}</h3>
      <dl className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wider">Logged searches</dt>
          <dd className="text-foreground">{w.totalSearches}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider">Hybrid mode rows</dt>
          <dd className="text-foreground">{w.hybridModeCount}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider">Fallback triggered</dt>
          <dd className="text-foreground">
            {w.fallbackCount}{" "}
            <span className="text-muted-foreground">
              ({pct(w.fallbackCount, w.totalSearches)} of logs)
            </span>
          </dd>
        </div>
      </dl>
      {w.topFallbackReasons.length > 0 ? (
        <div className="mt-4 border-t border-border/40 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Top fallback reasons ({w.fallbackReasonsExact ? "full window" : "sample"})
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-foreground">
            {w.topFallbackReasons.map((r) => (
              <li key={r.reason} className="flex justify-between gap-4">
                <span className="min-w-0 truncate" title={r.reason}>
                  {r.reason}
                </span>
                <span className="shrink-0 text-muted-foreground">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AiConsoleMetricsSection({
  last24h,
  last7d,
  loadError,
}: {
  last24h: AiSearchMetricsWindow | null;
  last7d: AiSearchMetricsWindow | null;
  loadError: string | null;
}) {
  return (
    <DashboardSectionCard
      title="Search analytics (search_queries)"
      description="Counts from the analytics table; RLS allows staff SELECT. Empty zeros usually mean no traffic or logging off for pagination."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : last24h && last7d ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricsWindowCard w={last24h} />
          <MetricsWindowCard w={last7d} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Metrics unavailable.</p>
      )}
    </DashboardSectionCard>
  );
}

export function AiConsoleTuningSection({ env }: { env: AiTuningEnvSnapshot }) {
  return (
    <DashboardSectionCard
      title="Runtime tuning (read-only)"
      description="Environment overrides effective on this server instance. Change in hosting env / .env.local — not from this UI."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
        {(
          [
            ["AI_PROVIDER (env override)", env.aiProviderEnvOverride],
            ["IMPRONTA_RRF_CLASSIC_WEIGHT", env.improntaRrfClassicWeight],
            ["IMPRONTA_RRF_VECTOR_WEIGHT", env.improntaRrfVectorWeight],
            ["IMPRONTA_EMBED_CACHE_GEN", env.improntaEmbedCacheGen],
            ["IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS", env.improntaVectorNeighborCacheTtlMs],
            ["IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX", env.improntaVectorNeighborCacheMax],
            ["IMPRONTA_REFINE_CACHE_TTL_MS", env.improntaRefineCacheTtlMs],
            ["OPENAI_CHAT_MODEL", env.openaiChatModel],
            ["ANTHROPIC_CHAT_MODEL", env.anthropicChatModel],
            ["Embedding model (code)", env.openaiEmbeddingModel],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </DashboardSectionCard>
  );
}

const DOC_PATHS: { path: string; note: string }[] = [
  { path: "docs/agent-logs.md", note: "Structured server events" },
  { path: "docs/ai-api-efficiency.md", note: "Caches, rate limits, dedupe" },
  { path: "docs/search-performance-budget.md", note: "Limits and env knobs" },
  { path: "docs/search-eval-set.md", note: "Offline eval harness" },
  { path: "docs/ai-fallback-ux.md", note: "User-visible fallback copy" },
  { path: "docs/ai-data-retention.md", note: "Retention posture" },
  { path: "docs/ai-release-playbook.md", note: "Deploy / rollback" },
];

export function AiConsoleDocsSection() {
  return (
    <DashboardSectionCard
      title="Documentation & runbooks"
      description="Paths are repo-root relative (open in your editor). Eval: from web/, pnpm eval:search with .env.local."
      titleClassName={ADMIN_SECTION_TITLE_CLASS}
    >
      <ul className="space-y-2 text-sm text-muted-foreground">
        {DOC_PATHS.map((d) => (
          <li key={d.path}>
            <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs text-foreground">
              {d.path}
            </code>
            <span> — {d.note}</span>
          </li>
        ))}
        <li>
          <Link href="/admin/site-settings/audit" className="text-primary hover:underline">
            Site settings audit
          </Link>
          <span> — CMS / settings mutations</span>
        </li>
      </ul>
    </DashboardSectionCard>
  );
}
