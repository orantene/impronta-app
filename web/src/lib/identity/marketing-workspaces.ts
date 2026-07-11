import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActorIdentity } from "@/lib/identity/hybrid-mode";
import type { MarketingWorkspaceLink } from "@/components/marketing/marketing-account-menu";

/** Owner first, then admin → viewer. Unknown roles sort last. */
const ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  coordinator: 2,
  editor: 3,
  viewer: 4,
};

/**
 * Every tenant the signed-in user has a workspace role in, as direct links to
 * that workspace's admin dashboard on the app host — for the marketing account
 * menu's workspace switcher. Empty for pure talent/client accounts (no
 * `agency_memberships` rows), where the menu falls back to a single dashboard
 * link. Reused by the marketing shell and the platform-chrome talent page so
 * both render an identical switcher.
 */
export async function loadMarketingWorkspaceLinks(
  supabase: SupabaseClient,
  userId: string,
  appUrl: string,
): Promise<MarketingWorkspaceLink[]> {
  const identity = await resolveActorIdentity(supabase, userId);
  return (identity?.workspaces ?? [])
    .filter((w) => w.tenantSlug)
    .map((w) => ({
      slug: w.tenantSlug,
      name: w.tenantName,
      role: w.role,
      href: `${appUrl}/${w.tenantSlug}/admin`,
    }))
    .sort(
      (a, b) =>
        (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9) ||
        a.name.localeCompare(b.name),
    );
}
