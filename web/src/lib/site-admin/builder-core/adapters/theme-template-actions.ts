"use server";

/**
 * Server actions for the theme_template surface. Platform-admin gated (same
 * gate() pattern as builder-lab/themes/actions.ts). Called across the RSC
 * boundary by the bound adapter. Persistence goes through the drafts store
 * (CAS on rev); nothing here touches a legacy slot table.
 */

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { loadThemeDraft, saveThemeDraftTree } from "@/lib/talent-site/theme-template/drafts.server";
import type { ThemeDraftTree } from "@/lib/talent-site/theme-template/types";

import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";
import type {
  ThemeTemplateLoaded,
  ThemeTemplateSaveOutcome,
} from "./theme-template-adapter-core";

// Not imported from the core: a "use server" file may only export async functions.
const THEME_TEMPLATE_TABLE = "talent_theme_drafts";

async function gate(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

export async function loadThemeTemplateTreeAction(input: {
  design: string;
  tree: ThemeDraftTree;
}): Promise<{ ok: true; value: ThemeTemplateLoaded } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    const res = await loadThemeDraft(admin, input.design);
    if (!res.ok) return { ok: false, error: res.error };
    const nodes =
      input.tree === "shell" ? res.value.payload.shellTree : res.value.payload.homeTree;
    return {
      ok: true,
      value: {
        design: input.design,
        tree: (nodes ?? []) as BuilderNodeTree,
        rev: res.value.rev,
      },
    };
  } catch (err) {
    logServerError("themeTemplate.load", err);
    return { ok: false, error: "Could not load this design draft." };
  }
}

export async function saveThemeTemplateTreeAction(input: {
  design: string;
  tree: ThemeDraftTree;
  nodes: BuilderNodeTree;
  expectedRev: number;
}): Promise<ThemeTemplateSaveOutcome> {
  assertNoLegacyBuilderWrite("theme_template", THEME_TEMPLATE_TABLE);
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    const res = await saveThemeDraftTree(admin, {
      design: input.design,
      tree: input.tree,
      nodes: input.nodes as never,
      expectedRev: input.expectedRev,
      actorId: g.userId,
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.code === "stale_rev"
            ? "This design draft changed elsewhere. Reload before saving."
            : res.error,
      };
    }
    return { ok: true, rev: res.value.rev };
  } catch (err) {
    logServerError("themeTemplate.save", err);
    return { ok: false, error: "Could not save this design draft." };
  }
}
