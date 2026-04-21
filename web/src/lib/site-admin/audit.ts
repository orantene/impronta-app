/**
 * Phase 5 — unified audit log shape.
 *
 * All Phase 5 mutations emit a single row into the platform audit log via
 * emitAuditEvent(). Shape is locked at plan kickoff:
 *   tenant_id           UUID
 *   actor_profile_id    UUID (nullable: platform-admin-on-behalf-of flows)
 *   action              dotted (e.g. "agency.site_admin.branding.publish")
 *   entity_type         TEXT (e.g. "agency_branding", "cms_pages")
 *   entity_id           UUID
 *   diff_summary        TEXT (<= 240 chars; human-readable)
 *   before_hash         TEXT (sha-256 hex of pre-change JSON snapshot)
 *   after_hash          TEXT (sha-256 hex of post-change JSON snapshot)
 *   correlation_id      TEXT (request id; propagates across logs)
 *
 * The actual persistence table is `public.platform_audit_log`; this module
 * centralizes shape + truncation + hashing so call sites only build domain
 * payloads.
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_DIFF_SUMMARY_MAX = 240;

export interface Phase5AuditEvent {
  tenantId: string;
  actorProfileId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  diffSummary: string;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  correlationId: string;
}

function sha256(value: unknown): string {
  const canonical = JSON.stringify(value ?? null);
  return createHash("sha256").update(canonical).digest("hex");
}

function truncate(summary: string): string {
  if (summary.length <= AUDIT_DIFF_SUMMARY_MAX) return summary;
  return `${summary.slice(0, AUDIT_DIFF_SUMMARY_MAX - 1)}…`;
}

/**
 * Persist a Phase 5 audit event via the security-definer RPC
 * `public.record_phase5_audit`. Best-effort: failures log but do not abort
 * the mutation (the mutation already succeeded at call time).
 *
 * The RPC validates is_staff_of_tenant() + action prefix server-side and
 * writes to platform_audit_log (Zone 1 cross-tenant audit).
 */
export async function emitAuditEvent(
  supabase: SupabaseClient,
  event: Phase5AuditEvent,
): Promise<void> {
  const { error } = await supabase.rpc("record_phase5_audit", {
    p_tenant_id: event.tenantId,
    p_action: event.action,
    p_target_type: event.entityType,
    p_target_id: event.entityId,
    p_diff_summary: truncate(event.diffSummary),
    p_before_hash: sha256(event.beforeSnapshot),
    p_after_hash: sha256(event.afterSnapshot),
    p_correlation_id: event.correlationId,
  });
  if (error) {
    console.warn("[site-admin/audit] rpc failed", {
      action: event.action,
      error: error.message,
    });
  }
}
