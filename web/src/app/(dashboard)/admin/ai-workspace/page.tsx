import { Sparkles } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { readAiTuningEnvSnapshot } from "@/lib/ai/ai-console-metrics";
import { isCredentialEncryptionConfigured } from "@/lib/ai/credential-vault";
import { OPENAI_EMBEDDING_MODEL_ID } from "@/lib/ai/openai-embeddings";
import { resolveAnthropicApiKey, resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import {
  getEnvAiProviderOverride,
  getResolvedAiChatKind,
} from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

import { AiMasterModeForm } from "./ai-master-mode-form";
import { AiWorkspaceQuickEnableButton } from "./ai-workspace-quick-enable";
import { AiWorkspaceShell } from "./ai-workspace-shell";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────
 * Phase 17 — AI workspace consolidation.
 *
 * Single page replaces /admin/ai-workspace + /admin/ai-workspace/settings.
 * Master toggle + quick-enable stay inline at the top (high-frequency,
 * one-click actions). Everything else lives in cards that open drawers
 * via DashboardEditPanel — feature switches, quality refinements,
 * provider configuration, usage controls, audit log, diagnostics. The
 * three rich diagnostic surfaces (Console, Logs, Match preview) stay as
 * deep-link cards because they're full-screen pages.
 * ──────────────────────────────────────────────────────────────────── */

const AVAILABILITY_TOGGLES = [
  {
    key: "ai_search_enabled",
    label: "AI search (guest experience)",
    description:
      "When on, search may use AI-assisted interpretation and ranking. Directory still works without a provider.",
  },
  {
    key: "ai_rerank_enabled",
    label: "AI re-rank",
    description:
      "Re-rank eligible result sets with ranking signals when a provider is available.",
  },
  {
    key: "ai_explanations_enabled",
    label: "AI match explanations",
    description:
      "Structured “why this match” on cards when a provider is available.",
  },
  {
    key: "ai_refine_enabled",
    label: "AI refine suggestions",
    description:
      "Post-search taxonomy chip suggestions when a provider is available.",
  },
  {
    key: "ai_draft_enabled",
    label: "Inquiry drafting",
    description:
      "LLM-assisted inquiry drafts on the public inquiry form when a provider is available.",
  },
  {
    key: "ai_translations_enabled",
    label: "AI translations (admin)",
    description:
      "AI-assisted translation workflows in the dashboard when a provider is available.",
  },
  {
    key: "ai_embeddings_semantic_enabled",
    label: "Semantic / vector features",
    description:
      "Use embeddings for hybrid semantic retrieval. Requires an OpenAI key path (platform or agency).",
  },
];

const QUALITY_TOGGLES = [
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

type Setting = { key: string; value: unknown };

function settingToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return JSON.stringify(value);
}

export default async function AiWorkspacePage() {
  const [
    flags,
    chatKind,
    envOverride,
    tuning,
    openaiKeyResolved,
    anthropicKeyResolved,
    supabase,
  ] = await Promise.all([
    getAiFeatureFlags(),
    getResolvedAiChatKind(),
    Promise.resolve(getEnvAiProviderOverride()),
    Promise.resolve(readAiTuningEnvSnapshot()),
    resolveOpenAiApiKey(),
    resolveAnthropicApiKey(),
    getCachedServerSupabase(),
  ]);
  const openaiPath = Boolean(openaiKeyResolved?.trim());
  const anthropicPath = Boolean(anthropicKeyResolved?.trim());
  const encryptionReady = isCredentialEncryptionConfigured();

  let settingsMap: Record<string, string> = {};
  let registryRows: Parameters<typeof AiWorkspaceShell>[0]["registryRows"] = [];
  let auditRows: Parameters<typeof AiWorkspaceShell>[0]["auditRows"] = [];
  let tenantControls: Parameters<typeof AiWorkspaceShell>[0]["tenantControls"] = {
    credential_mode: "inherit",
    monthly_spend_cap_cents: null,
    warn_threshold_percent: null,
    hard_stop_on_cap: true,
    max_requests_per_minute: null,
    max_requests_per_month: null,
    provider_unavailable_behavior: "graceful",
  };
  let embedCount: number | null = null;

  if (supabase) {
    const [
      { data: settingsRows },
      { data: instRows },
      { data: ctrl },
      { data: auditData },
      { count: embedCountVal },
    ] = await Promise.all([
      supabase.from("settings").select("key, value"),
      supabase
        .from("ai_provider_instances")
        .select(
          "id, kind, label, is_default, disabled, sort_order, credential_source, credential_ui_state, credential_masked_hint",
        )
        .order("sort_order", { ascending: true }),
      supabase.from("ai_tenant_controls").select("*").maybeSingle(),
      supabase
        .from("ai_provider_audit")
        .select("id, action, entity_type, entity_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("talent_embeddings")
        .select("talent_profile_id", { count: "exact", head: true }),
    ]);

    if (settingsRows) {
      settingsMap = Object.fromEntries(
        (settingsRows as Setting[]).map((s) => [s.key, settingToString(s.value)]),
      );
    }
    if (instRows?.length) {
      registryRows = instRows as typeof registryRows;
    }
    if (ctrl) {
      const c = ctrl as Record<string, unknown>;
      tenantControls = {
        credential_mode:
          (c.credential_mode as "platform" | "agency" | "inherit") ?? "inherit",
        monthly_spend_cap_cents:
          typeof c.monthly_spend_cap_cents === "number"
            ? c.monthly_spend_cap_cents
            : null,
        warn_threshold_percent:
          typeof c.warn_threshold_percent === "number"
            ? c.warn_threshold_percent
            : null,
        hard_stop_on_cap: c.hard_stop_on_cap !== false,
        max_requests_per_minute:
          typeof c.max_requests_per_minute === "number"
            ? c.max_requests_per_minute
            : null,
        max_requests_per_month:
          typeof c.max_requests_per_month === "number"
            ? c.max_requests_per_month
            : null,
        provider_unavailable_behavior:
          c.provider_unavailable_behavior === "strict" ? "strict" : "graceful",
      };
    }
    if (auditData?.length) {
      auditRows = auditData as typeof auditRows;
    }
    embedCount = embedCountVal ?? 0;
  }

  const availabilityOnCount = AVAILABILITY_TOGGLES.reduce(
    (n, s) => (settingsMap[s.key] === "true" ? n + 1 : n),
    0,
  );

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Sparkles}
        title="AI workspace"
        description="One surface for AI configuration. Master toggle below; everything else opens in a drawer."
      />

      {!supabase ? (
        <p className="text-sm text-muted-foreground">
          Supabase not configured — AI settings cannot be loaded or saved.
        </p>
      ) : null}

      <DashboardSectionCard
        title="Master AI"
        description="Global on/off for this agency. Cards below are gated by this switch."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AiMasterModeForm
          enabled={flags.ai_master_enabled}
          className="mb-3"
          description="When off, every provider-backed feature stays off even if individual switches are on."
        />
        <AiWorkspaceQuickEnableButton />
      </DashboardSectionCard>

      <AiWorkspaceShell
        flags={flags}
        availabilityToggles={AVAILABILITY_TOGGLES}
        qualityToggles={QUALITY_TOGGLES}
        settingsMap={settingsMap}
        registryRows={registryRows}
        tenantControls={tenantControls}
        auditRows={auditRows}
        encryptionReady={encryptionReady}
        envOverride={envOverride}
        chatKind={chatKind}
        openaiPath={openaiPath}
        anthropicPath={anthropicPath}
        embedCount={embedCount}
        openaiChatModel={tuning.openaiChatModel}
        anthropicChatModel={tuning.anthropicChatModel}
        embedModelId={OPENAI_EMBEDDING_MODEL_ID}
        tuning={{
          aiProviderEnvOverride: tuning.aiProviderEnvOverride,
          improntaRrfClassicWeight: tuning.improntaRrfClassicWeight,
          improntaRrfVectorWeight: tuning.improntaRrfVectorWeight,
          improntaEmbedCacheGen: tuning.improntaEmbedCacheGen,
          improntaVectorNeighborCacheTtlMs: tuning.improntaVectorNeighborCacheTtlMs,
          improntaVectorNeighborCacheMax: tuning.improntaVectorNeighborCacheMax,
          improntaRefineCacheTtlMs: tuning.improntaRefineCacheTtlMs,
        }}
        availabilityOnCount={availabilityOnCount}
      />
    </div>
  );
}
