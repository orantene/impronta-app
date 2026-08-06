/**
 * AdminQuickBarMount — server gate for the storefront admin quick bar.
 *
 * WAVE 6.1. The bar shipped in #1001 mounted from `EditChrome`'s idle branch,
 * which meant it only ever appeared where the EDITOR appears: the homepage,
 * `/p/<slug>` pages, and `/directory`. Every other public page a tenant serves
 * gave a signed-in operator nothing at all, which is most of the public site.
 *
 * This mount fixes the reach without touching the editor's gating. It is a
 * SEPARATE, deliberately lightweight server component that reuses the same
 * tenant + capability resolution (`getPublicHostContext` +
 * `agency.site_admin.pages.edit`), and it is now the ONLY owner of the bar —
 * `EditChrome` no longer renders it, so there is no path on which two bars can
 * stack.
 *
 * What it will not do:
 *   - It does not widen the EDITOR's surface. The editor still mounts exactly
 *     where it did; this mount renders chrome only.
 *   - It shares `non-storefront-path.ts` with the editor mount, so admin, auth,
 *     onboarding and dashboard paths are excluded by the same list. The bar
 *     must never sit on top of dashboard chrome.
 *   - It renders nothing while edit mode is engaged. The editor topbar owns the
 *     top of the screen then, and two bars is the exact noise #1001 avoided.
 *     Gating on the tenant's edit cookie (rather than on "would the editor
 *     mount on THIS path") is the conservative choice: it cannot produce a
 *     double bar under any routing change.
 *
 * WAVE 6.2 — hub hosts. The old component had a "no workspace slug" branch that
 * rendered the label and no links, which is dead chrome and against the house
 * no-dead-CTA rule. Instead of hiding the bar on hub hosts outright, this mount
 * resolves the tenant's `agencies.slug` from the database, so a hub host gets
 * the SAME real destinations as an agency host. Only when no slug exists at all
 * (every workspace link would 404) does the bar not render. The label-only
 * state no longer exists anywhere.
 *
 * WAVE 6.3 — the platform switch. `platform_settings.workspace_quick_bar_enabled`
 * lets HQ hide the bar per-deployment from the same "Workspace UI" card as the
 * FAB and the first-run tour. It defaults TRUE (the bar already shipped
 * visible), and a failed read degrades to that same default rather than
 * silently deleting a live feature on a transient DB error.
 *
 * Import this from the root layout alongside `EditChromeMount`. It is safe on
 * every path: it short-circuits on non-storefront, hostless and anonymous
 * requests before doing any expensive work.
 */

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasCapability } from "@/lib/access";
import { loadPlatformWorkspaceUi } from "@/lib/platform/workspace-ui";
import { requireSession } from "@/lib/server/action-guards";
import { improntaLog } from "@/lib/server/structured-log";
import {
  getPublicHostContext,
  HOST_TENANT_SLUG_HEADER,
  PUBLIC_PATH_PREFIX_HEADER,
  type PublicHostContext,
} from "@/lib/saas/scope";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { loadTenantSiteLabelForEditChrome } from "@/lib/site-admin/edit-mode/tenant-site-label";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";

import { AdminQuickBar } from "./admin-quick-bar";
import {
  isNonStorefrontPath,
  normalizeStorefrontPath,
} from "./non-storefront-path";

/**
 * Query flags that mean "some other chrome owns this render".
 *
 * `iframe=1` is the editor's device-preview child and `preview=1` is the staff
 * visitor-view. Both are deliberately chrome-free views of the storefront; a
 * bar pinned to the top would land inside the 390px device frame and lie about
 * what a visitor sees. The middleware's ORIGINAL_PATHNAME_HEADER carries the
 * query string, which is how the editor mount already detects `edit=1`.
 */
function isChromeSuppressedRequest(rawPathname: string): boolean {
  const query = rawPathname.split("?")[1] ?? "";
  return /(^|&)(iframe|preview)=1(&|$)/.test(query);
}

export async function AdminQuickBarMount() {
  // Headers first (cheap) so admin / auth / platform routes never pay for a DB
  // round-trip.
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  if (isChromeSuppressedRequest(rawPathname)) return null;

  const publicPathPrefix = reqHeaders.get(PUBLIC_PATH_PREFIX_HEADER) ?? "";
  const hostTenantSlug = reqHeaders.get(HOST_TENANT_SLUG_HEADER) ?? "";
  const normalizedPath = normalizeStorefrontPath(
    rawPathname.split("?")[0] ?? "/",
    publicPathPrefix,
    hostTenantSlug,
  );
  if (isNonStorefrontPath(normalizedPath)) return null;

  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") return null;

  // Same membership proof the editor uses, scoped to the tenant this host
  // serves: a member of tenant A never sees the bar on tenant B's site, and a
  // signed-out visitor never sees it at all.
  const session = await requireSession();
  if (!session.ok) return null;
  const isMember = await userHasCapability(
    "agency.site_admin.pages.edit",
    ctx.tenantId,
  );
  if (!isMember) return null;

  const { quickBarEnabled } = await loadPlatformWorkspaceUi();
  if (!quickBarEnabled) return null;

  // Edit mode engaged → the editor topbar owns the top of the screen.
  if (await isEditModeActiveForTenant(ctx.tenantId)) return null;

  const workspaceSlug = await resolveWorkspaceSlug(session.supabase, ctx);
  // No slug means every workspace destination would 404. Render nothing rather
  // than a label with no actions (wave 6.2).
  if (!workspaceSlug) return null;

  let siteLabel: string | null = null;
  try {
    siteLabel = await loadTenantSiteLabelForEditChrome(
      session.supabase,
      ctx.tenantId,
    );
  } catch (err) {
    // A missing label only costs the bar its tenant name; the links still work.
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("admin_quick_bar_mount.warn", {
        message: "[quick-bar] loadTenantSiteLabelForEditChrome failed:",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return <AdminQuickBar workspaceSlug={workspaceSlug} siteLabel={siteLabel} />;
}

/**
 * Workspace URL segment for `/{slug}/admin/*`.
 *
 * Agency hosts usually carry the slug on the host context. Hub hosts never do,
 * and neither do path-addressed hosts (`localhost/w/<slug>`, the shared app
 * host) where `agency_domains.tenant_slug` is empty — which is exactly why the
 * bar used to degrade to a link-less label there. So look it up: one indexed
 * `agencies` read, on a request that has already proven membership.
 */
async function resolveWorkspaceSlug(
  supabase: SupabaseClient,
  ctx: PublicHostContext,
): Promise<string | null> {
  if (ctx.kind === "agency" && ctx.tenantSlug.trim() !== "") {
    return ctx.tenantSlug;
  }
  try {
    const { data } = await supabase
      .from("agencies")
      .select("slug")
      .eq("id", ctx.tenantId)
      .maybeSingle();
    const slug = (data?.slug as string | undefined)?.trim();
    return slug ? slug : null;
  } catch {
    return null;
  }
}
