import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { readAiTuningEnvSnapshot } from "@/lib/ai/ai-console-metrics";
import { OPENAI_EMBEDDING_MODEL_ID } from "@/lib/ai/openai-embeddings";
import { resolveAnthropicApiKey, resolveOpenAiApiKey } from "@/lib/ai/resolve-api-keys";
import {
  getEnvAiProviderOverride,
  getResolvedAiChatKind,
  getResolvedAiProviderId,
  isResolvedAiChatConfigured,
} from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { cn } from "@/lib/utils";

import { AiWorkspaceQuickEnableButton } from "./ai-workspace-quick-enable";
import { AiMasterModeForm } from "./ai-master-mode-form";

export const dynamic = "force-dynamic";

const SETTINGS = "/admin/ai-workspace/settings";

function OnOff({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
      )}
    >
      {on ? "On" : "Off"}
    </span>
  );
}

function StatusCard({
  title,
  href,
  children,
  /** Set false when children include links (invalid nested anchors). Title row still links to `href`. */
  cardAsLink = true,
}: {
  title: string;
  href: string;
  children: ReactNode;
  cardAsLink?: boolean;
}) {
  const shell =
    "group flex flex-col rounded-2xl border border-border/60 bg-card/40 shadow-sm transition-colors hover:border-primary/35 hover:bg-muted/10";
  const titleRow = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );

  if (cardAsLink) {
    return (
      <Link href={href} className={cn(shell, "p-4")}>
        {titleRow}
        <div className="space-y-1 text-xs text-muted-foreground">{children}</div>
      </Link>
    );
  }

  return (
    <div className={cn(shell, "overflow-hidden")}>
      <Link href={href} className="block p-4 pb-2 no-underline hover:bg-muted/5">
        {titleRow}
      </Link>
      <div className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

export default async function AiWorkspacePage() {
  const flags = await getAiFeatureFlags();
  const providerId = await getResolvedAiProviderId();
  const chatKind = await getResolvedAiChatKind();
  const chatConfigured = await isResolvedAiChatConfigured();
  const envOverride = getEnvAiProviderOverride();
  const tuning = readAiTuningEnvSnapshot();

  const openaiKey = Boolean((await resolveOpenAiApiKey())?.trim());
  const anthropicKey = Boolean((await resolveAnthropicApiKey())?.trim());

  const supabase = await getCachedServerSupabase();
  let embedCount: number | null = null;
  if (supabase) {
    const { count, error } = await supabase
      .from("talent_embeddings")
      .select("talent_profile_id", { count: "exact", head: true });
    if (!error) embedCount = count ?? 0;
  }

  const searchModeLabel = flags.ai_search_quality_v2
    ? "Quality v2 (RRF + hybrid cursor)"
    : "Baseline hybrid merge";
  const activeChatModel =
    providerId === "anthropic" ? tuning.anthropicChatModel : tuning.openaiChatModel;
  const masterEnabled = flags.ai_master_enabled;

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Sparkles}
        title="AI workspace"
        description="Live flags and environment status. Configure toggles and provider in AI Settings."
      />

      <DashboardSectionCard
        title="Quick actions"
        description="Quickly flip AI mode for the whole site, or enable the saved guest-facing AI features at once."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AiMasterModeForm
          enabled={masterEnabled}
          className="mb-4"
          description="Use this as your master AI on/off switch. When off, the site falls back to classic behavior even if the feature toggles stay saved as on."
        />
        <AiWorkspaceQuickEnableButton />
        <p className="mt-3 text-xs text-muted-foreground">
          Prefer granular control?{" "}
          <Link href={`${SETTINGS}#ai-settings-feature-toggles`} className="text-primary hover:underline">
            Feature switches
          </Link>
        </p>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Status"
        description="Each card links to the matching section in AI Settings."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatusCard title="Search" href={`${SETTINGS}#ai-settings-feature-toggles`}>
            <p className="flex flex-wrap items-center gap-2">
              <OnOff on={masterEnabled && flags.ai_search_enabled} />
              <span>{searchModeLabel}</span>
            </p>
            {!masterEnabled ? <p>Master AI mode is off.</p> : null}
            <p>
              OpenAI (embeddings):{" "}
              <span className={openaiKey ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                {openaiKey ? "OpenAI key path OK" : "no OpenAI key path"}
              </span>
            </p>
            <p>
              Indexed profiles:{" "}
              <span className="font-mono text-foreground">
                {embedCount === null ? "—" : embedCount}
              </span>
            </p>
          </StatusCard>

          <StatusCard title="Rerank" href={`${SETTINGS}#ai-settings-feature-toggles`}>
            <p className="flex items-center gap-2">
              <OnOff on={masterEnabled && flags.ai_rerank_enabled} />
              <span>Signal-based re-ordering after retrieval</span>
            </p>
          </StatusCard>

          <StatusCard title="Explanations" href={`${SETTINGS}#ai-settings-v2-toggles`}>
            <p className="flex flex-wrap items-center gap-2">
              <OnOff on={masterEnabled && flags.ai_explanations_enabled} />
              <span>v2 rules</span>
              <OnOff on={masterEnabled && flags.ai_explanations_v2} />
            </p>
          </StatusCard>

          <StatusCard title="Refine" href={`${SETTINGS}#ai-settings-v2-toggles`}>
            <p className="flex flex-wrap items-center gap-2">
              <OnOff on={masterEnabled && flags.ai_refine_enabled} />
              <span>v2 chips</span>
              <OnOff on={masterEnabled && flags.ai_refine_v2} />
            </p>
          </StatusCard>

          <StatusCard title="Inquiry draft" href={`${SETTINGS}#ai-settings-feature-toggles`}>
            <p className="flex items-center gap-2">
              <OnOff on={masterEnabled && flags.ai_draft_enabled} />
              <span>Public inquiry assistant</span>
            </p>
          </StatusCard>

          <StatusCard title="Provider" href={`${SETTINGS}#ai-settings-provider`}>
            <p>
              Default:{" "}
              <span className="font-medium text-foreground">
                {chatKind === "anthropic"
                  ? "Anthropic (Claude)"
                  : chatKind === "openai"
                    ? "OpenAI"
                    : chatKind === "custom"
                      ? "Custom (coming soon)"
                      : "None"}
              </span>
            </p>
            {envOverride ? (
              <p className="text-amber-700 dark:text-amber-300">
                Env override: <code className="font-mono">{envOverride}</code>
              </p>
            ) : (
              <p>
                Registry resolves to <code className="font-mono">{flags.ai_provider}</code> for chat
                adapters.
              </p>
            )}
            <p>
              Chat key:{" "}
              <span className={chatConfigured ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                {chatConfigured ? "available" : "not available for default provider"}
              </span>
            </p>
            <p>
              Resolved key paths: OpenAI {openaiKey ? "✓" : "—"}, Anthropic {anthropicKey ? "✓" : "—"}
            </p>
            <p className="font-mono text-[10px] text-foreground/80">Model: {activeChatModel}</p>
          </StatusCard>

          <StatusCard title="Embeddings" href={`${SETTINGS}#ai-settings-embeddings`}>
            <p>
              Model: <code className="font-mono text-foreground">{OPENAI_EMBEDDING_MODEL_ID}</code>
            </p>
            <p>In-memory cache: 12 min TTL, max 400 entries.</p>
          </StatusCard>

          <StatusCard
            title="Runtime tuning"
            href={`${SETTINGS}#ai-settings-runtime-tuning`}
            cardAsLink={false}
          >
            <p>
              RRF classic / vector:{" "}
              <span className="font-mono text-[10px] text-foreground">
                {tuning.improntaRrfClassicWeight} / {tuning.improntaRrfVectorWeight}
              </span>
            </p>
            <p className="pt-1">
              <Link href="/admin/ai-workspace/console" className="text-primary hover:underline">
                AI Console (metrics)
              </Link>
              {" · "}
              <Link href="/admin/ai-workspace/logs" className="text-primary hover:underline">
                Search logs
              </Link>
            </p>
          </StatusCard>
        </div>
      </DashboardSectionCard>

      <p className="text-sm text-muted-foreground">
        <Link href="/admin/ai-workspace/match-preview" className="text-primary hover:underline">
          Talent match preview
        </Link>
        {" · "}
        <Link href="/admin/ai-workspace/console" className="text-primary hover:underline">
          AI Console
        </Link>
      </p>
    </div>
  );
}
