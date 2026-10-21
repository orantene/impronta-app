import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { tradeFromCategories, type ExampleTrade } from "./work-style";
import { planWorkStyleChange, presetFor, rowToChoice, storedToPreset, type Change, type StoredWorkStyle, type WorkStyleChoice } from "./work-style";

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

const COLUMNS = "work_model, requests_go_to, chat_seen_by, price_shown, split_kind, split_bps, safety_officer";

/** The full stored style. `unknown` = unreadable (never "nothing stored", so nothing is overwritten blind). */
async function readStored(admin: SupabaseClient, tenantId: string): Promise<{ kind: "none" } | { kind: "stored"; value: StoredWorkStyle } | { kind: "unavailable" } | { kind: "unknown" }> {
  const { data, error } = await tenantScopedQuery(admin, "workspace_hub_defaults", tenantId).select(COLUMNS).maybeSingle();
  if (error) {
    if (tableMissing(error)) return { kind: "unavailable" };
    logServerError("service-hub.workStyle.readStored", error);
    return { kind: "unknown" };
  }
  if (!data) return { kind: "none" };
  const value = storedToPreset(data as Record<string, unknown>);
  // A row we cannot read back is never overwritten without a human looking at it.
  return value ? { kind: "stored", value } : { kind: "unknown" };
}

export type SaveWorkStyle =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "unavailable" | "failed" }
  | { ok: false; reason: "confirm_required"; changes: Change[] };

/**
 * First time: writes the preset. Already set: nothing changes unless `confirmed` is true,
 * and the confirm is checked against what is stored NOW (the server re-plans), so a stale
 * screen cannot overwrite a newer choice. The update is pinned to the style it was planned
 * against, so a concurrent change makes it ask again instead of overwriting.
 */
export async function saveWorkStyle(
  admin: SupabaseClient,
  input: { tenantId: string; userId: string; choice: WorkStyleChoice; confirmed?: boolean },
): Promise<SaveWorkStyle> {
  const stored = await readStored(admin, input.tenantId);
  if (stored.kind === "unavailable") return { ok: false, reason: "unavailable" };
  if (stored.kind === "unknown") return { ok: false, reason: "failed" };
  const plan = planWorkStyleChange(stored.kind === "stored" ? stored.value : null, input.choice);
  if (plan.kind === "same") return { ok: true, changed: false };
  if (plan.kind === "confirm" && input.confirmed !== true) return { ok: false, reason: "confirm_required", changes: plan.changes };

  const p = presetFor(input.choice);
  const now = new Date().toISOString();
  const row = {
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
  };
  if (plan.kind === "first_time") {
    const { error } = await tenantScopedQuery(admin, "workspace_hub_defaults", input.tenantId).insert(row);
    if (error) {
      if (tableMissing(error)) return { ok: false, reason: "unavailable" };
      // Someone set it a moment ago: ask again with the real diff instead of overwriting.
      if (error.code === "23505") {
        const again = await readStored(admin, input.tenantId);
        if (again.kind === "stored") {
          const replan = planWorkStyleChange(again.value, input.choice);
          if (replan.kind === "same") return { ok: true, changed: false };
          if (replan.kind === "confirm") return { ok: false, reason: "confirm_required", changes: replan.changes };
        }
      }
      logServerError("service-hub.workStyle.insert", error);
      return { ok: false, reason: "failed" };
    }
    return { ok: true, changed: true };
  }
  const from = stored.kind === "stored" ? stored.value.choice : input.choice;
  const { data, error } = await tenantScopedQuery(admin, "workspace_hub_defaults", input.tenantId).update(row).eq("work_model", from).select("tenant_id");
  if (error) {
    if (tableMissing(error)) return { ok: false, reason: "unavailable" };
    logServerError("service-hub.workStyle.update", error);
    return { ok: false, reason: "failed" };
  }
  if (!data || (data as unknown[]).length === 0) {
    const again = await readStored(admin, input.tenantId);
    if (again.kind === "stored") {
      const replan = planWorkStyleChange(again.value, input.choice);
      if (replan.kind === "confirm") return { ok: false, reason: "confirm_required", changes: replan.changes };
    }
    return { ok: false, reason: "failed" };
  }
  return { ok: true, changed: true };
}

/** The workspace's trade for the example lines, from its own services. null = unknown (use the stable pick). */
export async function loadWorkspaceTrade(admin: SupabaseClient, tenantId: string): Promise<ExampleTrade | null> {
  const { data, error } = await tenantScopedQuery(admin, "talent_offerings", tenantId).select("category, title").eq("status", "published").limit(200);
  if (error) {
    logServerError("service-hub.workStyle.trade", error);
    return null;
  }
  const rows = (data ?? []) as Array<{ category?: string | null; title?: string | null }>;
  return tradeFromCategories(rows.flatMap((r) => [r.category, r.title]));
}
