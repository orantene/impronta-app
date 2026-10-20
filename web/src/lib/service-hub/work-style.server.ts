import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { presetFor, rowToChoice, type WorkStyleChoice } from "./work-style";

/**
 * Reads and writes the workspace's "how you work with people" answer (TUL-1442). The row
 * lives in workspace_hub_defaults (held migration 20261231420600). Service role, so every
 * query is tenant scoped. An unreadable answer is `unknown`, never "not chosen yet", so a
 * read failure does not re-ask a workspace that already answered.
 */

export type WorkStyleState = { kind: "chosen"; choice: WorkStyleChoice } | { kind: "none" } | { kind: "unknown" };

/** 42703 / 42P01 / PGRST205: the held table is not applied yet, so nothing has been chosen. */
function tableMissing(error: { code?: string } | null): boolean {
  const c = error?.code;
  return c === "42703" || c === "42P01" || c === "PGRST205";
}

export async function loadWorkStyle(admin: SupabaseClient, tenantId: string): Promise<WorkStyleState> {
  const { data, error } = await tenantScopedQuery(admin, "workspace_hub_defaults", tenantId).select("work_model").maybeSingle();
  if (error) {
    if (tableMissing(error)) return { kind: "none" };
    logServerError("service-hub.howYouWork.load", error);
    return { kind: "unknown" };
  }
  const choice = rowToChoice(data as Record<string, unknown> | null);
  return choice ? { kind: "chosen", choice } : { kind: "none" };
}

export type SaveWorkStyle = { ok: true } | { ok: false; reason: "unavailable" | "failed" };

export async function saveWorkStyle(
  admin: SupabaseClient,
  input: { tenantId: string; userId: string; choice: WorkStyleChoice },
): Promise<SaveWorkStyle> {
  const p = presetFor(input.choice);
  const now = new Date().toISOString();
  const { error } = await tenantScopedQuery(admin, "workspace_hub_defaults", input.tenantId).upsert(
    {
      work_model: input.choice,
      requests_go_to: p.requestsGoTo,
      chat_seen_by: p.chatSeenBy,
      price_shown: p.priceShown,
      split_kind: p.split.kind,
      split_bps: p.split.bps,
      safety_officer: p.safetyOfficer,
      chosen_by: input.userId,
      chosen_at: now,
      updated_at: now,
    },
    { onConflict: "tenant_id" },
  );
  if (error) {
    if (tableMissing(error)) return { ok: false, reason: "unavailable" };
    logServerError("service-hub.howYouWork.save", error);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}
