"use client";

import { useMemo, useState } from "react";
import { DocsSearchBar, type DocsSearchScope } from "@/components/docs/docs-search-bar";
import { DocsSidebarNav, DocsSidebarNavMobile } from "@/components/docs/docs-sidebar-nav";
import { DocsSection } from "@/components/docs/docs-section";
import { DocsTable, type DocsTableColumn } from "@/components/docs/docs-table";
import { DocsStepList } from "@/components/docs/docs-step-list";
import { DocsBadge } from "@/components/docs/docs-badge";
import { AI_FEATURES_COLUMNS, AI_FEATURES_ROWS, AI_FLAG_DOC_ROWS } from "@/lib/docs/ai-docs-content";
import type { AiFeatureFlags } from "@/lib/settings/ai-feature-flags";

const TOC_LINKS = [
  { label: "AI overview", href: "#ai-overview" },
  { label: "Activation", href: "#ai-activation" },
  { label: "Flags", href: "#ai-flags" },
  { label: "Provider", href: "#ai-provider" },
  { label: "Troubleshooting", href: "#ai-troubleshooting" },
];

const FLAG_COLUMNS: DocsTableColumn[] = [
  { key: "key", label: "Flag", sortable: true },
  { key: "purpose", label: "Purpose", sortable: true },
  { key: "audience", label: "Audience", sortable: true },
  { key: "live", label: "Live value", sortable: true },
];

function formatFlagValue(key: string, flags: AiFeatureFlags): string {
  if (key === "ai_provider") return flags.ai_provider;
  const v = flags[key as keyof AiFeatureFlags];
  if (typeof v === "boolean") return v ? "On" : "Off";
  return String(v ?? "—");
}

function sectionMatchesQuery(
  title: string,
  bodyHints: string[],
  q: string,
  scopes: DocsSearchScope[],
): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const titleHit = title.toLowerCase().includes(needle);
  const contentHit = bodyHints.some((h) => h.toLowerCase().includes(needle));
  const sec = scopes.includes("sections");
  const cont = scopes.includes("content");
  if (sec && cont) return titleHit || contentHit;
  if (sec) return titleHit;
  if (cont) return contentHit;
  return true;
}

export function AiDocsClient({ flags }: { flags: AiFeatureFlags }) {
  const [query, setQuery] = useState("");
  const [scopes, setScopes] = useState<DocsSearchScope[]>(["sections", "tables", "content"]);

  const flagRows = useMemo(
    () =>
      AI_FLAG_DOC_ROWS.map((row) => ({
        key: row.key,
        purpose: row.purpose,
        audience: row.audience,
        live: formatFlagValue(row.key, flags),
      })),
    [flags],
  );

  const tableQuery = scopes.includes("tables") ? query : "";
  const showFeaturesTable = scopes.includes("tables");
  const showFlagsTable = scopes.includes("tables");
  const showNarrativeSections = scopes.includes("sections") || scopes.includes("content");

  return (
    <div className="space-y-6">
      <DocsSearchBar value={query} onChange={setQuery} scopes={scopes} onScopesChange={setScopes} />

      <DocsSidebarNavMobile links={TOC_LINKS} />

      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-6">
          {showFeaturesTable ? (
            <DocsSection
              id="ai-overview"
              eyebrow="AI system"
              title="Features"
              description="Sort and search the matrix. Headers stay visible while scrolling wide tables."
            >
              <DocsTable columns={AI_FEATURES_COLUMNS} rows={AI_FEATURES_ROWS} searchQuery={tableQuery} />
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery(
            "Most important capabilities",
            ["rerank", "explanations", "refine", "draft", "quality"],
            query,
            scopes,
          ) ? (
            <DocsSection
              eyebrow="Control center"
              title="Most important capabilities"
              description="Prioritize these when onboarding a new operator—they cover guest search quality and staff assist flows."
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {[
                  "Hybrid semantic search with optional quality v2 fusion path.",
                  "LLM rerank for shortlists that need subjective fit.",
                  "Explanations for transparent ranking narratives.",
                  "Refine suggestions to coach guest queries.",
                  "Inquiry drafts to accelerate staff replies.",
                ].map((line) => (
                  <li
                    key={line}
                    className="rounded-lg border border-border/50 bg-background/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("How to activate AI", ["toggle", "workspace", "settings"], query, scopes) ? (
            <DocsSection
              id="ai-activation"
              eyebrow="Activation"
              title="How to activate AI"
              description="Start in AI workspace, then refine toggles in AI Settings. Keys must be present in the deployment environment."
            >
              <DocsStepList
                steps={[
                  {
                    title: "Confirm provider keys",
                    detail: "Ensure OpenAI (embeddings) and your chosen chat provider env vars are set on the server.",
                  },
                  {
                    title: "Use quick enable or granular toggles",
                    detail: "Batch-enable core guest features, then adjust v2 quality flags individually if needed.",
                  },
                  {
                    title: "Validate in match preview",
                    detail: "Run representative queries and confirm ranking, explanations, and refine behavior.",
                  },
                ]}
              />
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("How AI works", ["embeddings", "lexical", "rerank"], query, scopes) ? (
            <DocsSection
              eyebrow="Architecture"
              title="How AI works"
              description="A practical mental model for operators—omitting vendor-specific internals."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    t: "Embeddings",
                    d: "Talent and queries are embedded for similarity scoring alongside lexical retrieval.",
                  },
                  { t: "Merge", d: "Signals are fused into a single ranking with optional v2 quality enhancements." },
                  { t: "Optional rerank", d: "A chat model re-sorts a short list using the live brief context." },
                ].map((cell) => (
                  <div key={cell.t} className="rounded-xl border border-border/55 bg-muted/10 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--impronta-gold)]">
                      {cell.t}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{cell.d}</p>
                  </div>
                ))}
              </div>
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("How to use AI (admin)", ["workspace", "logs", "preview"], query, scopes) ? (
            <DocsSection
              eyebrow="Operators"
              title="How to use AI (admin)"
              description="Day-to-day surfaces inside this dashboard."
            >
              <div className="flex flex-wrap gap-2">
                <DocsBadge variant="gold">AI workspace</DocsBadge>
                <DocsBadge variant="muted">Search logs</DocsBadge>
                <DocsBadge variant="muted">Match preview</DocsBadge>
                <DocsBadge variant="muted">Console</DocsBadge>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Use workspace for status, logs for forensic review, match preview for qualitative QA before toggling flags
                broadly.
              </p>
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("How to use AI (guest)", ["directory", "refine", "explanations"], query, scopes) ? (
            <DocsSection
              eyebrow="Guests"
              title="How to use AI (guest)"
              description="What visitors experience when flags are on."
            >
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2 rounded-lg border border-border/50 bg-background/25 px-3 py-2">
                  <DocsBadge variant="success">Search</DocsBadge>
                  <span>Richer directory search with optional explanations and refine prompts.</span>
                </li>
                <li className="flex gap-2 rounded-lg border border-border/50 bg-background/25 px-3 py-2">
                  <DocsBadge>Session</DocsBadge>
                  <span>Behavior varies by UI surface; always test on mobile and desktop templates.</span>
                </li>
              </ul>
            </DocsSection>
          ) : null}

          {showFlagsTable ? (
            <DocsSection
              id="ai-flags"
              eyebrow="Flags"
              title="Feature flags"
              description="Live values from settings. Change them in AI Settings; this table is read-only documentation."
            >
              <DocsTable columns={FLAG_COLUMNS} rows={flagRows} searchQuery={tableQuery} />
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("Provider settings", ["openai", "anthropic", "routing"], query, scopes) ? (
            <DocsSection
              id="ai-provider"
              eyebrow="Provider"
              title="Provider settings"
              description={`Active chat provider: ${flags.ai_provider}. Embeddings remain on the embedding stack regardless of chat routing.`}
            >
              <div className="overflow-x-auto rounded-xl border border-border/55">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/25">
                    <tr>
                      <th className="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">Area</th>
                      <th className="px-3 py-2 font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/45">
                      <td className="px-3 py-2 text-foreground">Chat / NLU</td>
                      <td className="px-3 py-2 text-muted-foreground">Routed per ai_provider; requires matching API keys.</td>
                    </tr>
                    <tr className="border-t border-border/45">
                      <td className="px-3 py-2 text-foreground">Embeddings</td>
                      <td className="px-3 py-2 text-muted-foreground">Used for semantic search vectors; distinct from chat routing.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DocsSection>
          ) : null}

          {showNarrativeSections &&
          sectionMatchesQuery("Troubleshooting", ["key", "empty", "latency"], query, scopes) ? (
            <DocsSection
              id="ai-troubleshooting"
              eyebrow="Reliability"
              title="Troubleshooting"
              description="First checks when AI surfaces look empty or stale."
            >
              <ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
                <li>Verify environment keys and restart the app if you rotated secrets.</li>
                <li>Confirm embeddings exist for talent profiles when semantic search feels shallow.</li>
                <li>Inspect search logs for failed provider calls or guardrail messages.</li>
              </ul>
            </DocsSection>
          ) : null}
        </div>

        <DocsSidebarNav className="sticky top-20" links={TOC_LINKS} />
      </div>
    </div>
  );
}
