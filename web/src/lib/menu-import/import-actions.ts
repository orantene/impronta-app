"use server";

/**
 * import-actions.ts — preview a menu import, then apply the plan a human saw.
 *
 * TWO ACTIONS, NEVER ONE. `previewMenuImport` returns the plan and writes
 * nothing; `applyMenuImport` writes. 117 rows is far past what a person can
 * audit after the fact, so the confirm step is the product, not a flag.
 *
 * THE PLAN IS NEVER SENT BACK BY THE CLIENT. Apply re-reads the file, re-parses
 * and re-plans server-side, then writes what IT computed. A client-supplied plan
 * is a client-supplied price list — the same lesson as the payInPerson flag the
 * order engine used to trust.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import type { CapabilityKey } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { applyParsedMenu, loadExisting, type ApplyResult } from "./apply-parsed-menu";
import { parseRestauradminMenu } from "./parse-restauradmin";
import { planMenuImport, type ImportPlan } from "./plan-import";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

/** A menu export is bigger than a form post and smaller than a file upload. */
const MAX_SOURCE_BYTES = 2_000_000;

export type PreviewResult =
  | { ok: true; plan: ImportPlan }
  | { ok: false; error: string };

type Auth = { ok: true; tenantId: string } | { ok: false; error: string };

/**
 * TUL-1708: the preview action reads only, so it keeps the guard's viewer
 * default. The apply action writes `talent_offerings` — the same table
 * `talent/menu-offerings-actions.ts` gates with `agency.site_admin.sections.edit`
 * (editor and above) — so it passes that capability explicitly.
 */
const APPLY_CAPABILITY: CapabilityKey = "agency.site_admin.sections.edit";

async function authorize(tenantId: string, capability?: CapabilityKey): Promise<Auth> {
  const staff = await requireWorkspaceStaffAction(capability ? { capability } : undefined);
  if (!staff.ok) return { ok: false, error: staff.error };
  if (staff.tenantId !== tenantId) {
    return { ok: false, error: "Not authorized for this workspace." };
  }
  return { ok: true, tenantId: staff.tenantId };
}

function parseSource(source: string): { ok: true; doc: unknown } | { ok: false; error: string } {
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, error: "Paste a menu export first." };
  }
  if (source.length > MAX_SOURCE_BYTES) {
    return { ok: false, error: "That export is too large to import here." };
  }
  try {
    return { ok: true, doc: JSON.parse(source) };
  } catch {
    // Named, not "invalid input": an operator who pasted half a file needs to
    // know it was the JSON and not their permissions.
    return { ok: false, error: "That file is not valid JSON." };
  }
}

/** Read-only. Shows what WOULD happen; writes nothing, ever. */
export async function previewMenuImport(
  tenantId: string,
  source: string,
): Promise<PreviewResult> {
  try {
    const auth = await authorize(tenantId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const parsed = parseSource(source);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const menu = parseRestauradminMenu(parsed.doc);
    if (menu.items.length === 0 && menu.refused.length === 0) {
      return { ok: false, error: "No menu items found in that file." };
    }
    return { ok: true, plan: planMenuImport(menu, await loadExisting(admin, tenantId)) };
  } catch (error) {
    logServerError("menuImport.preview", error);
    return { ok: false, error: "Could not read that menu." };
  }
}

/**
 * Apply the plan this server computes from the same source.
 *
 * Per row: upsert the offering keyed on `attributes.source_id`, then replace its
 * variants and add-ons. `unchanged` rows are skipped rather than rewritten, so a
 * re-import of an untouched menu costs nothing and leaves `updated_at` alone.
 */
export async function applyMenuImport(
  tenantId: string,
  source: string,
): Promise<ApplyResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorize(tenantId, APPLY_CAPABILITY);
    if (!auth.ok) return { ok: false, error: auth.error };
    const parsed = parseSource(source);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const menu = parseRestauradminMenu(parsed.doc);
    const result = await applyParsedMenu(admin, tenantId, menu);
    if (!result.ok) return result;

    revalidatePath("/", "layout");
    return result;
  } catch (error) {
    logServerError("menuImport.apply", error);
    return { ok: false, error: "Could not import that menu." };
  }
}
