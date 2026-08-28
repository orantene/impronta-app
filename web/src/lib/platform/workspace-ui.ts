import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type PlatformWorkspaceUi = {
  /** Show the floating bottom-right "+" quick-action button in the workspace shell. */
  fabEnabled: boolean;
  /** Fire the first-run 4-step guided tour for new workspace admins. */
  tourEnabled: boolean;
  /**
   * Show the storefront admin quick bar (the thin strip a signed-in member of
   * the tenant sees across the top of their OWN public site).
   *
   * Defaults TRUE, unlike the other two. The bar shipped visible in #1001, so a
   * hidden-by-default switch would silently delete a live feature the moment
   * this column landed. HQ opts OUT here.
   */
  quickBarEnabled: boolean;
  /** In-app support launcher. Default FALSE; HQ opts in after verification. */
  supportEnabled: boolean;
};

/**
 * FAB + tour are hidden by default — HQ opts each back in from
 * /platform/admin/settings. The quick bar is the exception: already-shipped
 * behaviour, so its default preserves what tenants see today. This same object
 * is the degrade-to-safe result when the read fails, which is why it must state
 * the intended default rather than a blanket `false`.
 */
const DEFAULT_WORKSPACE_UI: PlatformWorkspaceUi = {
  fabEnabled: false,
  tourEnabled: false,
  quickBarEnabled: true,
  supportEnabled: false,
};

/**
 * Platform-wide workspace-UI switches (the `platform_settings` singleton).
 * A super-admin flips these on /platform/admin/settings; the workspace admin
 * layout threads the result onto the shell bridge. Cached per request.
 */
export const loadPlatformWorkspaceUi = cache(
  async (): Promise<PlatformWorkspaceUi> => {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return DEFAULT_WORKSPACE_UI;
      const { data } = await admin
        .from("platform_settings")
        .select(
          "workspace_fab_enabled, workspace_tour_enabled, workspace_quick_bar_enabled, workspace_support_enabled",
        )
        .eq("id", true)
        .maybeSingle();
      if (!data) return DEFAULT_WORKSPACE_UI;
      const row = data as typeof data & { workspace_support_enabled?: boolean };
      return {
        fabEnabled: !!data.workspace_fab_enabled,
        tourEnabled: !!data.workspace_tour_enabled,
        quickBarEnabled: data.workspace_quick_bar_enabled ?? true,
        supportEnabled: !!row.workspace_support_enabled,
      };
    } catch (err) {
      logServerError("platform.loadWorkspaceUi", err);
      return DEFAULT_WORKSPACE_UI;
    }
  },
);

/**
 * Persist the workspace-UI switches (singleton). Called by the super-admin
 * `use server` action after it has gated the caller. Lives in this server-only
 * lib so the raw `.from("platform_settings")` write stays out of the action
 * file (platform_settings has no tenant_id by design).
 */
export async function writePlatformWorkspaceUi(
  updatedBy: string,
  input: PlatformWorkspaceUi,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
      const { error } = await admin
        .from("platform_settings")
        .update({
          workspace_fab_enabled: input.fabEnabled,
          workspace_tour_enabled: input.tourEnabled,
          workspace_quick_bar_enabled: input.quickBarEnabled,
          workspace_support_enabled: input.supportEnabled,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        } as never)
      .eq("id", true);
    if (error) {
      logServerError("platform.writeWorkspaceUi", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeWorkspaceUi", err);
    return { ok: false };
  }
}
