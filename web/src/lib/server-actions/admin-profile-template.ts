"use server";

// ============================================================================
// admin-profile-template.ts — agency-scoped profile-page template chooser.
//
// Mirrors the Card Design pattern: a staff-only, immediate save of the
// per-tenant `template.profile-layout-family` design token (the sibling of
// `template.directory-card-family`). The public talent-profile route reads
// this token from agency_branding.theme_json to pick its layout component.
//
// NOTE: per the project's "use server" constraint, this file exports ONLY
// async functions — no type or const re-exports (those poison the client
// chunk / are rejected by Turbopack). Result shapes are structural.
// ============================================================================

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { getToken } from "@/lib/site-admin/tokens/registry";

const TOKEN_KEY = "template.profile-layout-family";

export async function loadProfileTemplateFamily(): Promise<
  { ok: true; family: string } | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await tenantScopedQuery(
    supabase,
    "agency_branding",
    tenantId,
  )
    .select("theme_json")
    .maybeSingle();
  if (error) {
    logServerError("admin-profile-template.load", error);
    return { ok: false, error: "Couldn't load the current profile template." };
  }
  const theme = (data as { theme_json?: unknown } | null)?.theme_json;
  const themeObj =
    typeof theme === "object" && theme !== null
      ? (theme as Record<string, unknown>)
      : {};
  const raw = themeObj[TOKEN_KEY];
  return { ok: true, family: typeof raw === "string" ? raw : "classic" };
}

export async function setProfileTemplateFamily(
  family: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Validate against the registry token (agency-configurable enum). This is
  // the single source of truth for which families are allowed.
  const spec = getToken(TOKEN_KEY);
  const parsed = spec?.validator.safeParse(family);
  if (!spec || !parsed || !parsed.success) {
    return { ok: false, error: "That profile template isn't available." };
  }
  const value = parsed.data as string;

  const { data: row, error: readErr } = await tenantScopedQuery(
    supabase,
    "agency_branding",
    tenantId,
  )
    .select("theme_json, theme_json_draft")
    .maybeSingle();
  if (readErr) {
    logServerError("admin-profile-template.read", readErr);
    return { ok: false, error: "Couldn't save the profile template." };
  }

  const r = row as
    | { theme_json?: unknown; theme_json_draft?: unknown }
    | null;
  const mergeKey = (j: unknown): Record<string, unknown> => {
    const base =
      typeof j === "object" && j !== null
        ? (j as Record<string, unknown>)
        : {};
    return { ...base, [TOKEN_KEY]: value };
  };

  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    theme_json: mergeKey(r?.theme_json),
    updated_at: new Date().toISOString(),
  };
  // Keep the design-panel draft in sync so a later Publish there doesn't
  // silently revert this choice.
  if (r && r.theme_json_draft != null) {
    patch.theme_json_draft = mergeKey(r.theme_json_draft);
  }

  const { error: upErr } = await tenantScopedQuery(
    supabase,
    "agency_branding",
    tenantId,
  ).upsert(patch, { onConflict: "tenant_id" });
  if (upErr) {
    logServerError("admin-profile-template.update", upErr);
    return { ok: false, error: "Couldn't save the profile template." };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}
