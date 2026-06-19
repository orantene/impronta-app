"use server";

/**
 * template-usage-actions.ts — the D7 template-adoption tally (provenance + usage).
 *
 * Two server actions over `public.builder_template_usage`:
 *
 *   - `recordTemplateUsage(input)` — append ONE row when a template is applied
 *     (inserted) into a tenant's builder tree via the Add Gallery "+" path. The
 *     append is BEST-EFFORT / non-fatal (mirrors `appendBuilderLabAudit`): it
 *     goes through the service-role client and NEVER throws, so a lost tally row
 *     can't brick an insert. It is a no-op when there is no source template id
 *     (native nodes carry no provenance).
 *
 *   - `getTemplateUsageTotals()` — super_admin-gated read that returns the
 *     `template_id → {appliedCount, tenantCount}` adoption map the Template
 *     Manager renders per card ("applied N times across M tenants").
 *
 * Inserts go through the service-role admin client (no insert RLS policy); reads
 * are gated here AND by the super_admin SELECT RLS. The pure aggregation lives in
 * `template-usage-shape.ts` so it stays unit-testable without a DB client.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  aggregateTemplateUsage,
  type BuilderTemplateUsageRow,
  type TemplateUsageTotals,
} from "./template-usage-shape";

export type { TemplateUsageTotals } from "./template-usage-shape";

export interface RecordTemplateUsageInput {
  /** Raw builder_templates.id (the `__sourceTemplateId` stamped at insert). */
  templateId: string | null | undefined;
  /** Tenant whose tree received the insert (null when unresolved). */
  tenantId?: string | null;
  /** Builder surface (homepage | cms_page | talent_page | talent_site | …). */
  surface?: string | null;
  /** Opaque page/slug reference for the inserted-into page. */
  pageRef?: string | null;
}

/**
 * Append one usage row. BEST-EFFORT: any failure is logged and swallowed so the
 * insert that triggered it is never blocked. No-op without a templateId.
 */
export async function recordTemplateUsage(
  input: RecordTemplateUsageInput,
): Promise<void> {
  try {
    if (!input.templateId) return;
    const sb = createServiceRoleClient();
    if (!sb) return;
    const { error } = await sb.from("builder_template_usage").insert({
      template_id: input.templateId,
      tenant_id: input.tenantId ?? null,
      surface: input.surface ?? null,
      page_ref: input.pageRef ?? null,
    } as never);
    if (error) logServerError("recordTemplateUsage", error);
  } catch (err) {
    // Never throw — a lost tally row must not brick the insert.
    logServerError("recordTemplateUsage", err);
  }
}

export type TemplateUsageResult =
  | { ok: true; data: Record<string, TemplateUsageTotals> }
  | { ok: false; error: string };

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

/**
 * Per-template adoption totals, super_admin only. Returns a plain object
 * (`template_id → totals`) so it crosses the server-action boundary cleanly.
 */
export async function getTemplateUsageTotals(): Promise<TemplateUsageResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  try {
    const sb = createServiceRoleClient();
    if (!sb) return { ok: false, error: "Service-role client unavailable." };

    const { data, error } = await sb
      .from("builder_template_usage")
      .select("template_id, tenant_id");
    if (error) {
      logServerError("getTemplateUsageTotals", error);
      return { ok: false, error: "Could not load template usage." };
    }

    const rows = (data ?? []) as BuilderTemplateUsageRow[];
    const totals = aggregateTemplateUsage(rows);
    return { ok: true, data: Object.fromEntries(totals) };
  } catch (err) {
    logServerError("getTemplateUsageTotals", err);
    return { ok: false, error: "Could not load template usage." };
  }
}
