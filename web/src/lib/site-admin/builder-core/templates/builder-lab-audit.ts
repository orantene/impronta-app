"use server";

/**
 * builder-lab-audit.ts — the Builder Lab activity / audit log (G1).
 *
 * Every super_admin governance WRITE in the Lab control-plane (overlay set/clear,
 * template publish/unpublish/archive, rollout change) appends an immutable row to
 * `public.builder_lab_audit` with a before/after JSON diff + the acting admin.
 *
 * The append (`appendBuilderLabAudit`) is BEST-EFFORT / non-fatal — it mirrors the
 * best-effort revision-snapshot insert in `publishRowCore`: it is awaited by the
 * caller but NEVER throws and never returns a failure that blocks the user's
 * action. A lost audit row must not brick a publish.
 *
 * Inserts go through the service-role admin client (the requireSuperAdmin() gate in
 * each chokepoint IS the auth boundary). Reads use the authenticated cookie client
 * so the super_admin-only SELECT RLS applies.
 *
 * Pure shape helpers (row→entry mapping, insert-payload build) live in
 * `builder-lab-audit-shape.ts` so they stay unit-testable without a DB client.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildAuditInsertPayload,
  mapAuditRowToEntry,
  distinctActorIds,
  type AppendBuilderLabAuditInput,
  type BuilderLabAuditEntry,
  type BuilderLabAuditRow,
} from "./builder-lab-audit-shape";

export type {
  BuilderLabAuditAction,
  AppendBuilderLabAuditInput,
  BuilderLabAuditEntry,
} from "./builder-lab-audit-shape";

/**
 * Append one audit row. BEST-EFFORT: any failure is logged and swallowed so the
 * calling governance action is never blocked or rolled back by an audit miss.
 */
export async function appendBuilderLabAudit(
  input: AppendBuilderLabAuditInput,
): Promise<void> {
  try {
    const sb = createServiceRoleClient();
    if (!sb) return;
    const payload = buildAuditInsertPayload(input);
    const { error } = await sb.from("builder_lab_audit").insert(payload as never);
    if (error) logServerError("appendBuilderLabAudit", error);
  } catch (err) {
    // Never throw — a lost audit row must not brick the governance action.
    logServerError("appendBuilderLabAudit", err);
  }
}

const FEED_LIMIT = 50;

interface ListBuilderLabAuditOptions {
  /** Filter to one item's history (per-row affordance). */
  itemRef?: string;
  /** Filter to one template's history (per-row affordance). */
  templateId?: string;
  limit?: number;
}

/**
 * Read recent audit rows, newest first. Super_admin-only (gated here AND by RLS).
 * Returns `[]` on any error / non-admin so the feed degrades to empty rather than
 * throwing. When `itemRef`/`templateId` is supplied, scopes to that item's history.
 */
export async function listBuilderLabAudit(
  options: ListBuilderLabAuditOptions = {},
): Promise<BuilderLabAuditEntry[]> {
  try {
    const session = await getCachedActorSession();
    if (!session.user || !isPlatformAdmin(session.profile)) return [];

    const sb = await createClient();
    if (!sb) return [];

    let query = sb
      .from("builder_lab_audit")
      .select("id, action, item_ref, template_id, actor, actor_label, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? FEED_LIMIT);

    if (options.itemRef) query = query.eq("item_ref", options.itemRef);
    if (options.templateId) query = query.eq("template_id", options.templateId);

    const { data, error } = await query;
    if (error || !data) return [];

    const rows = data as BuilderLabAuditRow[];

    // Resolve actor display names in one round-trip.
    const actorIds = distinctActorIds(rows);
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of (profiles as { id: string; full_name: string | null }[] | null) ?? []) {
        if (p.full_name) nameById.set(p.id, p.full_name);
      }
    }

    return rows.map((r) => mapAuditRowToEntry(r, nameById));
  } catch (err) {
    logServerError("listBuilderLabAudit", err);
    return [];
  }
}
