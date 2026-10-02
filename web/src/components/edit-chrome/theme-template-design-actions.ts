"use server";

/**
 * Theme drawer server actions for the theme_template surface (Template Factory).
 * TALENT-ONLY: edits a talent DESIGN's tokenDefaults on its open draft row
 * (talent_theme_drafts). Never touches agency_branding / site_looks.
 * Every action is platform-admin gated (super_admin), then uses the service role.
 * The design slug is the builder context's `pageSlug`.
 */

import { getPlatformRole } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import { loadThemeDraft, saveThemeDraftTokens } from "@/lib/talent-site/theme-template/drafts.server";
import { themeTemplateDrawerTokens } from "@/lib/talent-site/theme-template/theme-template-tokens";
import type {
  DesignLoadResult,
  DesignSaveResult,
} from "@/lib/site-admin/edit-mode/design-actions";

async function requireAdmin() {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false as const, error: "Forbidden - platform admin only.", code: "forbidden" };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Platform service client unavailable." };
  return { ok: true as const, admin, actorId: session.user.id };
}

export async function loadThemeTemplateDesignAction(input: {
  design: string;
  /** The editor's `?look=` palette key; colours shown are that palette's (with draft edits). */
  look?: string | null;
}): Promise<DesignLoadResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const res = await loadThemeDraft(gate.admin, input.design);
  if (!res.ok) return { ok: false, error: res.error, code: res.code };
  const themeDraft = themeTemplateDrawerTokens(res.value, null, input.look ?? null);
  return {
    ok: true,
    snapshot: {
      themeDraft,
      themeLive: themeDraft,
      presetSlug: null,
      themePublishedAt: null,
      version: res.value.rev,
      componentStylesDraft: {},
      componentStylesLive: {},
      designDisplayName: input.design,
      paletteDisplayName: null,
    },
  };
}

export async function saveThemeTemplateDesignAction(input: {
  design: string;
  patch: Record<string, string>;
  expectedRev: number;
  /** The editor's `?look=`: colour keys are saved on that palette. */
  look?: string | null;
}): Promise<DesignSaveResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.patch)) {
    if (typeof v === "string" && v.length > 0) cleaned[k] = v;
  }
  const { normalized } = validateThemePatch(cleaned);
  const res = await saveThemeDraftTokens(gate.admin, {
    design: input.design,
    patch: normalized,
    look: input.look ?? null,
    expectedRev: input.expectedRev,
    actorId: gate.actorId,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error,
      code: res.code === "stale_rev" ? "CONFLICT" : res.code,
    };
  }
  return {
    ok: true,
    version: res.value.rev,
    themeDraft: normalized,
    draftRev: res.value.rev,
  };
}
