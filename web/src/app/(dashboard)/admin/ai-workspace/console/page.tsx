import Link from "next/link";

import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import {
  loadAiSearchConsoleMetrics,
  readAiTuningEnvSnapshot,
} from "@/lib/ai/ai-console-metrics";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadAccessProfile } from "@/lib/access-profile";
import { isStaffRole } from "@/lib/auth-flow";
import {
  AiConsoleDocsSection,
  AiConsoleMetricsSection,
  AiConsoleTuningSection,
} from "./ai-console-sections";

export const dynamic = "force-dynamic";

export default async function AiConsolePage() {
  const flags = await getAiFeatureFlags();
  const tuning = readAiTuningEnvSnapshot();

  const supabase = await getCachedServerSupabase();
  let metricsError: string | null = null;
  let last24h = null;
  let last7d = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profile = user ? await loadAccessProfile(supabase, user.id) : null;
    if (user && isStaffRole(profile?.app_role)) {
      try {
        const m = await loadAiSearchConsoleMetrics(supabase);
        last24h = m.last24h;
        last7d = m.last7d;
      } catch {
        metricsError = "Could not load search metrics (check DB connectivity).";
      }
    } else {
      metricsError = "Metrics require an agency staff session.";
    }
  } else {
    metricsError = "Supabase not configured.";
  }

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div>
        <h1 className={ADMIN_SECTION_TITLE_CLASS}>AI Console</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Observability and tuning: analytics from <code className="text-foreground">search_queries</code>,
          environment readouts, and links to runbooks. Change persisted flags in AI → AI Settings.
        </p>
      </div>

      <AiConsoleMetricsSection
        last24h={last24h}
        last7d={last7d}
        loadError={metricsError}
      />

      <AiConsoleTuningSection env={tuning} />

      <DashboardSectionCard
        title="Current AI flags (read-only)"
        description="Persisted in public.settings — edit via AI → AI Settings."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <ul className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          {(
            [
              ["ai_master_enabled", flags.ai_master_enabled],
              ["ai_provider", flags.ai_provider],
              ["ai_search_enabled", flags.ai_search_enabled],
              ["ai_search_quality_v2", flags.ai_search_quality_v2],
              ["ai_rerank_enabled", flags.ai_rerank_enabled],
              ["ai_explanations_enabled", flags.ai_explanations_enabled],
              ["ai_explanations_v2", flags.ai_explanations_v2],
              ["ai_refine_enabled", flags.ai_refine_enabled],
              ["ai_refine_v2", flags.ai_refine_v2],
              ["ai_draft_enabled", flags.ai_draft_enabled],
            ] as const
          ).map(([k, v]) => (
            <li key={k}>
              {k}:{" "}
              <span className="text-foreground">
                {typeof v === "boolean" ? (v ? "on" : "off") : v}
              </span>
            </li>
          ))}
        </ul>
      </DashboardSectionCard>

      <AiConsoleDocsSection />

      <DashboardSectionCard title="Tools" description="Staff-only diagnostics and QA." titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <Link href="/admin/ai-workspace/match-preview" className="text-primary hover:underline">
              Talent match preview
            </Link>{" "}
            — hybrid search, explanations, pipeline debug DTO
          </li>
          <li>
            <Link href="/admin/ai-workspace/settings" className="text-primary hover:underline">
              AI Settings
            </Link>{" "}
            — provider, AI flags, and v2 rollout keys
          </li>
        </ul>
      </DashboardSectionCard>
    </div>
  );
}
