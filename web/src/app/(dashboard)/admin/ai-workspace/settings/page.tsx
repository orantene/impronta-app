import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import {
  ToggleSettingTableRow,
} from "@/app/(dashboard)/admin/settings/settings-forms";
import { AiMasterModeForm } from "@/app/(dashboard)/admin/ai-workspace/ai-master-mode-form";
import { AiProviderRegistryPanel } from "@/app/(dashboard)/admin/ai-workspace/ai-provider-registry-panel";
import { AiSetupHelpPopover } from "@/app/(dashboard)/admin/ai-workspace/ai-setup-help-popover";
import { AiUsageControlsForm } from "@/app/(dashboard)/admin/ai-workspace/ai-usage-controls-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_TH,
} from "@/lib/dashboard-shell-classes";
import { readAiTuningEnvSnapshot } from "@/lib/ai/ai-console-metrics";
import { isCredentialEncryptionConfigured } from "@/lib/ai/credential-vault";
import { OPENAI_EMBEDDING_MODEL_ID } from "@/lib/ai/openai-embeddings";
import { getEnvAiProviderOverride, getResolvedAiChatKind } from "@/lib/ai/resolve-provider";
import { resolveAnthropicApiKey, resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
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

const AVAILABILITY_TOGGLES: Array<{
  key: string;
  label: string;
  description?: string;
}> = [
  {
    key: "ai_search_enabled",
    label: "AI search (guest experience)",
    description:
      "When on, search may use AI-assisted interpretation and ranking. Directory still works without a provider.",
  },
  {
    key: "ai_rerank_enabled",
    label: "AI re-rank",
    description: "Re-rank eligible result sets with ranking signals when a provider is available.",
  },
  {
    key: "ai_explanations_enabled",
    label: "AI match explanations",
    description: "Structured “why this match” on cards when a provider is available.",
  },
  {
    key: "ai_refine_enabled",
    label: "AI refine suggestions",
    description: "Post-search taxonomy chip suggestions when a provider is available.",
  },
  {
    key: "ai_draft_enabled",
    label: "Inquiry drafting",
    description: "LLM-assisted inquiry drafts on the public inquiry form when a provider is available.",
  },
  {
    key: "ai_translations_enabled",
    label: "AI translations (admin)",
    description: "AI-assisted translation workflows in the dashboard when a provider is available.",
  },
  {
    key: "ai_embeddings_semantic_enabled",
    label: "Semantic / vector features",
    description:
      "Use embeddings for hybrid semantic retrieval. Requires an OpenAI key path (platform or agency).",
  },
];

const QUALITY_V2_TOGGLES: Array<{
  key: string;
  label: string;
  description?: string;
}> = [
  {
    key: "ai_search_quality_v2",
    label: "AI search quality v2",
    description: "RRF hybrid merge + classic continuation cursor when hybrid first page.",
  },
  {
    key: "ai_refine_v2",
    label: "AI refine v2",
    description: "Richer refine chip ranking.",
  },
  {
    key: "ai_explanations_v2",
    label: "AI explanations v2",
    description: "Richer explanation rules + public confidence line on cards.",
  },
];

export default async function AiWorkspaceSettingsPage() {
  const supabase = await getCachedServerSupabase();
  const flags = await getAiFeatureFlags();
  const tuning = readAiTuningEnvSnapshot();
  const envOverride = getEnvAiProviderOverride();
  const chatKind = await getResolvedAiChatKind();
  const openaiPath = Boolean((await resolveOpenAiApiKey())?.trim());
  const anthropicPath = Boolean((await resolveAnthropicApiKey())?.trim());
  const encryptionReady = isCredentialEncryptionConfigured();

  let settingsMap: Record<string, string> = {};
  if (supabase) {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (!error && data) {
      settingsMap = Object.fromEntries(
        (data as Setting[]).map((s) => [s.key, settingToString(s.value)]),
      );
    }
  }

  let registryRows: Array<{
    id: string;
    kind: "none" | "openai" | "anthropic" | "custom";
    label: string;
    is_default: boolean;
    disabled: boolean;
    sort_order: number;
    credential_source: "platform" | "agency" | "inherit";
    credential_ui_state: string;
    credential_masked_hint: string | null;
  }> = [];

  let tenantControls: {
    credential_mode: "platform" | "agency" | "inherit";
    monthly_spend_cap_cents: number | null;
    warn_threshold_percent: number | null;
    hard_stop_on_cap: boolean;
    max_requests_per_minute: number | null;
    max_requests_per_month: number | null;
    provider_unavailable_behavior: "graceful" | "strict";
  } = {
    credential_mode: "inherit",
    monthly_spend_cap_cents: null,
    warn_threshold_percent: null,
    hard_stop_on_cap: true,
    max_requests_per_minute: null,
    max_requests_per_month: null,
    provider_unavailable_behavior: "graceful",
  };

  let auditRows: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }> = [];

  if (supabase) {
    const { data: inst } = await supabase
      .from("ai_provider_instances")
      .select(
        "id, kind, label, is_default, disabled, sort_order, credential_source, credential_ui_state, credential_masked_hint",
      )
      .order("sort_order", { ascending: true });
    if (inst?.length) {
      registryRows = inst as typeof registryRows;
    }

    const { data: ctrl } = await supabase.from("ai_tenant_controls").select("*").maybeSingle();
    if (ctrl) {
      const c = ctrl as Record<string, unknown>;
      tenantControls = {
        credential_mode: (c.credential_mode as "platform" | "agency" | "inherit") ?? "inherit",
        monthly_spend_cap_cents:
          typeof c.monthly_spend_cap_cents === "number" ? c.monthly_spend_cap_cents : null,
        warn_threshold_percent:
          typeof c.warn_threshold_percent === "number" ? c.warn_threshold_percent : null,
        hard_stop_on_cap: c.hard_stop_on_cap !== false,
        max_requests_per_minute:
          typeof c.max_requests_per_minute === "number" ? c.max_requests_per_minute : null,
        max_requests_per_month:
          typeof c.max_requests_per_month === "number" ? c.max_requests_per_month : null,
        provider_unavailable_behavior:
          c.provider_unavailable_behavior === "strict" ? "strict" : "graceful",
      };
    }

    const { data: aud } = await supabase
      .from("ai_provider_audit")
      .select("id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (aud?.length) auditRows = aud as typeof auditRows;
  }

  const noChat = chatKind === "none" || chatKind === "custom";
  const providerLabel =
    chatKind === "anthropic"
      ? "Anthropic"
      : chatKind === "openai"
        ? "OpenAI"
        : chatKind === "custom"
          ? "Custom (not available)"
          : "None";

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={SlidersHorizontal}
        title="AI settings"
        description="Product availability, provider configuration, and usage limits — managed in the dashboard without exposing secrets to the browser."
      />

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          Supabase not configured — settings cannot be loaded or saved.
        </p>
      )}

      <DashboardSectionCard
        id="ai-settings-master-mode"
        title="AI availability"
        description="Controls what the product is allowed to do. Turning items off does not remove your data, directory, or inquiries — it only disables AI-backed stages."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AiMasterModeForm
          enabled={flags.ai_master_enabled}
          description="Global AI availability for this agency. When off, provider-backed features stay off even if individual switches below are on."
        />
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-feature-toggles"
        title="Feature switches"
        description="Guest-facing and admin AI features. These describe product behavior, not billing or API keys."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/25 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[min(100%,520px)] text-sm">
              <caption className="sr-only">AI feature switches</caption>
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
                {AVAILABILITY_TOGGLES.map((s) => (
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
        id="ai-settings-quality-v2"
        title="Quality refinements"
        description="Incremental upgrades to merge, refine, and explanation quality."
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
                {QUALITY_V2_TOGGLES.map((s) => (
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
        id="ai-settings-provider"
        title="Provider configuration"
        description="Runtime provider registry and encrypted keys. Keys are stored server-side only; the UI never receives raw secrets after save."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        right={<AiSetupHelpPopover />}
      >
        {envOverride ? (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <strong>AI_PROVIDER</strong> is set in the host environment to{" "}
            <code className="font-mono">{envOverride}</code> — this overrides the dashboard default
            for chat completions.
          </p>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Default chat provider
            </p>
            <p className="mt-1 font-medium text-foreground">{providerLabel}</p>
            {noChat ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No provider connected — classic directory, inquiries, and non-AI flows continue.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Provider-backed features use this default when AI availability is on.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Key paths (resolved server-side)
            </p>
            <p className="mt-1 text-foreground">
              OpenAI:{" "}
              <span className={openaiPath ? "text-emerald-600 dark:text-emerald-400" : ""}>
                {openaiPath ? "available" : "not available"}
              </span>
            </p>
            <p className="mt-1 text-foreground">
              Anthropic:{" "}
              <span className={anthropicPath ? "text-emerald-600 dark:text-emerald-400" : ""}>
                {anthropicPath ? "available" : "not available"}
              </span>
            </p>
          </div>
        </div>

        {supabase ? (
          <AiProviderRegistryPanel
            instances={registryRows}
            encryptionReady={encryptionReady}
            tenantCredentialMode={tenantControls.credential_mode}
          />
        ) : null}
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-usage"
        title="Usage controls"
        description="Cost guardrails and throttling. Separate from product availability and provider keys."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {supabase ? <AiUsageControlsForm initial={tenantControls} /> : null}
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-audit"
        title="Provider audit log"
        description="Recent changes to providers and tenant controls (actor, action, metadata)."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        {auditRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries yet.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto font-mono text-xs">
            {auditRows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-muted-foreground"
              >
                <span className="text-foreground">{r.created_at}</span> — {r.action}{" "}
                <span className="text-foreground">{r.entity_type}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSectionCard>

      <DashboardSectionCard
        id="ai-settings-chat-models"
        title="Model names (host environment)"
        description="These remain deployment-level overrides; they are not editable per agency in this release."
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
        title="Embeddings (OpenAI)"
        description="Hybrid semantic retrieval uses OpenAI embeddings; vector dimensions are tied to pgvector."
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
        id="ai-settings-runtime-tuning"
        title="Runtime tuning (read-only)"
        description="Environment overrides on this server instance."
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
