import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import {
  SelectSettingForm,
  ToggleSettingTableRow,
} from "@/app/(dashboard)/admin/settings/settings-forms";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_TH,
} from "@/lib/dashboard-shell-classes";
import { readAiTuningEnvSnapshot } from "@/lib/ai/ai-console-metrics";
import { OPENAI_EMBEDDING_MODEL_ID } from "@/lib/ai/openai-embeddings";
import { getEnvAiProviderOverride } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { cn } from "@/lib/utils";

type Setting = { key: string; value: unknown };

function settingToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return JSON.stringify(value);
}

const CORE_AI_TOGGLES: Array<{
  key: string;
  label: string;
  description?: string;
}> = [
  {
    key: "ai_search_enabled",
    label: "AI search (vector / hybrid)",
    description:
      "When on, AI search routes may use embeddings when configured; classic directory remains fallback.",
  },
  {
    key: "ai_rerank_enabled",
    label: "AI re-rank",
    description: "Re-rank vector/classic results with ranking signals.",
  },
  {
    key: "ai_explanations_enabled",
    label: "AI match explanations",
    description: "Structured “why this match” on directory cards when enabled.",
  },
  {
    key: "ai_refine_enabled",
    label: "AI refine suggestions",
    description: "Post-search taxonomy chip suggestions.",
  },
  {
    key: "ai_draft_enabled",
    label: "AI inquiry draft",
    description: "LLM-assisted inquiry message drafting on the public inquiry form.",
  },
];

const V2_AI_TOGGLES: Array<{
  key: string;
  label: string;
  description?: string;
}> = [
  {
    key: "ai_search_quality_v2",
    label: "AI search quality v2",
    description:
      "RRF hybrid merge + classic continuation cursor when hybrid first page. Off = baseline merge.",
  },
  {
    key: "ai_refine_v2",
    label: "AI refine v2",
    description: "Richer refine chip ranking (location overlap, top-card fit slugs).",
  },
  {
    key: "ai_explanations_v2",
    label: "AI explanations v2",
    description: "Primary-type / query overlap rules + public confidence line on cards.",
  },
];

export default async function AiWorkspaceSettingsPage() {
  const supabase = await getCachedServerSupabase();
  const flags = await getAiFeatureFlags();
  const tuning = readAiTuningEnvSnapshot();
  const envOverride = getEnvAiProviderOverride();

  let settingsMap: Record<string, string> = {};
  if (supabase) {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (!error && data) {
      settingsMap = Object.fromEntries(
        (data as Setting[]).map((s) => [s.key, settingToString(s.value)]),
      );
    }
  }

  const openaiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const anthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const providerDb = settingsMap.ai_provider || "openai";

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={SlidersHorizontal}
        title="AI Settings"
        description="Chat provider, feature flags, and read-only runtime / embedding configuration."
      />

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          Supabase not configured — settings cannot be loaded or saved.
        </p>
      )}

      <DashboardSectionCard
        id="ai-settings-provider"
        title="AI provider (chat & NLU)"
        description="Stored in settings as ai_provider. API keys stay in environment variables only."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {envOverride ? (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <strong>AI_PROVIDER</strong> is set in the environment to{" "}
            <code className="font-mono">{envOverride}</code> — this overrides the database
            selection for all chat completions.
          </p>
        ) : null}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              OpenAI API key
            </p>
            <p className="mt-1 font-medium text-foreground">
              {openaiKey ? "Configured" : "Not configured"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Required for embeddings and for chat when provider is OpenAI.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Anthropic API key
            </p>
            <p className="mt-1 font-medium text-foreground">
              {anthropicKey ? "Configured" : "Not configured"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Required when provider is Anthropic (Claude).
            </p>
          </div>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">
          Active provider (database):{" "}
          <span className="font-mono text-foreground">{flags.ai_provider}</span>
        </p>
        <SelectSettingForm
          settingKey="ai_provider"
          currentValue={providerDb === "anthropic" ? "anthropic" : "openai"}
          label="Chat provider"
          description="OpenAI or Anthropic for interpret-search, inquiry draft, and translations."
          options={[
            { value: "openai", label: "OpenAI" },
            { value: "anthropic", label: "Anthropic (Claude)" },
          ]}
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-chat-models"
        title="Chat models (read-only)"
        description="Set via hosting environment. Values below are what this server instance sees."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              OPENAI_CHAT_MODEL
            </dt>
            <dd className="mt-1 text-foreground">{tuning.openaiChatModel}</dd>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ANTHROPIC_CHAT_MODEL
            </dt>
            <dd className="mt-1 text-foreground">{tuning.anthropicChatModel}</dd>
          </div>
        </dl>
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-embeddings"
        title="Embeddings (read-only)"
        description="Hybrid directory search always uses OpenAI embeddings; dimensions are tied to pgvector."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            Model: <code className="text-foreground">{OPENAI_EMBEDDING_MODEL_ID}</code>
          </li>
          <li>In-memory embed cache: 12 min TTL, max 400 entries (see openai-embeddings.ts).</li>
        </ul>
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-core-toggles"
        title="Core AI feature toggles"
        description="Enable guest-facing AI without redeploying."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[min(100%,520px)] text-sm">
              <caption className="sr-only">Core AI toggles</caption>
              <thead className={ADMIN_TABLE_HEAD}>
                <tr className="border-b border-border/45 text-left">
                  <th scope="col" className={ADMIN_TABLE_TH}>
                    Feature
                  </th>
                  <th scope="col" className={cn(ADMIN_TABLE_TH, "w-[10rem] text-right")}>
                    Enabled
                  </th>
                </tr>
              </thead>
              <tbody>
                {CORE_AI_TOGGLES.map((s) => (
                  <ToggleSettingTableRow
                    key={s.key}
                    settingKey={s.key}
                    currentValue={settingsMap[s.key] ?? "false"}
                    label={s.label}
                    description={s.description}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-v2-toggles"
        title="Quality v2 toggles"
        description="Roll out stronger merge, refine, and explanation rules incrementally."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[min(100%,520px)] text-sm">
              <caption className="sr-only">Quality v2 toggles</caption>
              <thead className={ADMIN_TABLE_HEAD}>
                <tr className="border-b border-border/45 text-left">
                  <th scope="col" className={ADMIN_TABLE_TH}>
                    Feature
                  </th>
                  <th scope="col" className={cn(ADMIN_TABLE_TH, "w-[10rem] text-right")}>
                    Enabled
                  </th>
                </tr>
              </thead>
              <tbody>
                {V2_AI_TOGGLES.map((s) => (
                  <ToggleSettingTableRow
                    key={s.key}
                    settingKey={s.key}
                    currentValue={settingsMap[s.key] ?? "false"}
                    label={s.label}
                    description={s.description}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-runtime-tuning"
        title="Runtime tuning (read-only)"
        description="Environment overrides on this server. Change in hosting / .env.local."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          {(
            [
              ["AI_PROVIDER override", tuning.aiProviderEnvOverride],
              ["IMPRONTA_RRF_CLASSIC_WEIGHT", tuning.improntaRrfClassicWeight],
              ["IMPRONTA_RRF_VECTOR_WEIGHT", tuning.improntaRrfVectorWeight],
              ["IMPRONTA_EMBED_CACHE_GEN", tuning.improntaEmbedCacheGen],
              ["IMPRONTA_VECTOR_NEIGHBOR_CACHE_TTL_MS", tuning.improntaVectorNeighborCacheTtlMs],
              ["IMPRONTA_VECTOR_NEIGHBOR_CACHE_MAX", tuning.improntaVectorNeighborCacheMax],
              ["IMPRONTA_REFINE_CACHE_TTL_MS", tuning.improntaRefineCacheTtlMs],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md border border-border/50 bg-muted/15 px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className="mt-1 text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/admin/ai-workspace/console" className="text-primary hover:underline">
            AI Console
          </Link>{" "}
          — search metrics and doc links.
        </p>
      </DashboardSectionCard>
    </div>
  );
}
