"use server";

/**
 * Hybrid identity — server action wrapper around resolveActorIdentity
 * for the signed-in user. Returns the lightweight props the topbar
 * <HybridModeSwitcher> needs (canTalent / canWorkspace / hrefs).
 *
 * Messages Consolidation Plan v2 — item #8 live wire.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveActorIdentity, defaultPreferredSurface } from "@/lib/identity/hybrid-mode";

export type HybridSwitcherProps = {
  canTalent: boolean;
  canWorkspace: boolean;
  current: "talent" | "workspace";
  talentHref: string;
  workspaceHref: string;
};

const EMPTY: HybridSwitcherProps = {
  canTalent: false,
  canWorkspace: false,
  current: "workspace",
  talentHref: "#",
  workspaceHref: "#",
};

/** Item #8 wiring: load the current user's hybrid identity from
 *  Supabase and emit the props the topbar switcher needs. Returns
 *  EMPTY when the user is not signed in OR isn't a hybrid (either
 *  pure-talent without a workspace, or pure-workspace member without
 *  a talent profile) — in those cases HybridModeSwitcher renders
 *  nothing automatically. */
export async function loadHybridSwitcherProps(): Promise<HybridSwitcherProps> {
  const session = await getCachedActorSession();
  if (!session?.user) return EMPTY;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return EMPTY;

  const identity = await resolveActorIdentity(supabase, session.user.id);
  if (!identity) return EMPTY;

  const canTalent = !!identity.talent;
  const primaryWorkspace = identity.workspaces.find((w) => w.status === "active");
  const canWorkspace = !!primaryWorkspace;

  if (!canTalent || !canWorkspace) return EMPTY;

  // Default surface choice — owner/admin → workspace, else talent.
  const def = defaultPreferredSurface(identity);
  const current: HybridSwitcherProps["current"] = def === "talent" ? "talent" : "workspace";

  const slug = primaryWorkspace!.tenantSlug;
  return {
    canTalent,
    canWorkspace,
    current,
    talentHref: `/${slug}/talent/inbox`,
    workspaceHref: `/${slug}/admin`,
  };
}
