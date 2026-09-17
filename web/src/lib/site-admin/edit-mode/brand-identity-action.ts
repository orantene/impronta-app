"use server";

/**
 * "Use my business name as my logo": records the brand-identity choice that
 * satisfies the publish preflight (owner decision 1). The wordmark itself is
 * what the Look already renders when no logo asset exists; this only makes
 * the choice explicit and stored (`agencies.settings.brand_identity`).
 * Uploading a logo later replaces it in practice (the rule accepts either).
 */

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";

export type BrandIdentityActionResult = { ok: true } | { ok: false; error: string };

export async function setBrandIdentityWordmark(): Promise<BrandIdentityActionResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const { data: agency, error: readErr } = await admin.from("agencies").select("settings").eq("id", scope.tenantId).maybeSingle();
  if (readErr) {
    logServerError("brand-identity.read", readErr);
    return { ok: false, error: "Could not save that." };
  }
  const settings = agency?.settings && typeof agency.settings === "object" ? (agency.settings as Record<string, unknown>) : {};
  const { error } = await admin
    .from("agencies")
    .update({ settings: { ...settings, brand_identity: "wordmark" }, updated_at: new Date().toISOString() })
    .eq("id", scope.tenantId);
  if (error) {
    logServerError("brand-identity.write", error);
    return { ok: false, error: "Could not save that." };
  }
  scheduleWorkspaceAudit({
    tenantId: scope.tenantId,
    category: "settings",
    action: "branding.brand_identity.wordmark",
    summary: "Chose the business name as the logo",
    actorUserId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    actorKind: "staff",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
