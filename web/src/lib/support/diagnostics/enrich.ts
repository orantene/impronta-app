import "server-only";

import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "../support-from";
import type { DiagnosticsSnapshot } from "./collector";
import type { SupportTicketRow } from "../support-types";

export type EnrichedDiagnostics = DiagnosticsSnapshot & {
  tenantPlan: string | null;
  featureFlags: Record<string, unknown>;
  auditEvents: Array<{ action: string; summary: string | null; createdAt: string }>;
  sentryLink: string | null;
};

export async function enrichDiagnosticsSnapshot(
  snapshot: DiagnosticsSnapshot,
  ticket: SupportTicketRow,
): Promise<EnrichedDiagnostics> {
  const admin = createServiceRoleClient();
  let tenantPlan: string | null = null;
  let auditEvents: EnrichedDiagnostics["auditEvents"] = [];
  if (admin && ticket.tenantId) {
    const { data: agency } = await admin
      .from("agencies")
      .select("plan_tier")
      .eq("id", ticket.tenantId)
      .maybeSingle();
    tenantPlan = (agency?.plan_tier as string | null) ?? null;
    const { data: audit } = await admin
      .from("workspace_audit_events")
      .select("action, summary, created_at")
      .eq("tenant_id", ticket.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    auditEvents = (audit ?? []).map((row) => ({
      action: String(row.action ?? ""),
      summary: typeof row.summary === "string" ? row.summary : null,
      createdAt: String(row.created_at ?? ""),
    }));
  }

  let featureFlags: Record<string, unknown> = {};
  try {
    featureFlags = (await getAiFeatureFlags()) as unknown as Record<string, unknown>;
  } catch {
    featureFlags = {};
  }

  const sentryLink = snapshot.sentryLastEventId
    ? `https://sentry.io/?query=${encodeURIComponent(snapshot.sentryLastEventId)}`
    : null;

  return { ...snapshot, tenantPlan, featureFlags, auditEvents, sentryLink };
}

export async function persistDiagnostics(
  ticket: SupportTicketRow,
  enriched: EnrichedDiagnostics,
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;
  await supportFrom(admin, "support_ticket_diagnostics").insert({
    ticket_id: ticket.id,
    tenant_id: ticket.tenantId,
    app_version: enriched.appVersion,
    route: enriched.route,
    url: enriched.url,
    viewport: enriched.viewport,
    user_agent: enriched.userAgent,
    locale: enriched.locale,
    timezone: enriched.timezone,
    console_events: enriched.consoleEvents,
    network_failures: enriched.networkFailures,
    route_history: enriched.routeHistory,
    tenant_plan: enriched.tenantPlan,
    feature_flags: enriched.featureFlags,
    audit_events: enriched.auditEvents,
    sentry_last_event_id: enriched.sentryLastEventId,
    sentry_link: enriched.sentryLink,
    collected_at: enriched.collectedAt,
  });
  await supportFrom(admin, "support_ticket_events").insert({
    ticket_id: ticket.id,
    tenant_id: ticket.tenantId,
    actor_kind: "system",
    actor_user_id: null,
    event_type: "diagnostic_attached",
    new_value: { collectedAt: enriched.collectedAt },
  });
}
