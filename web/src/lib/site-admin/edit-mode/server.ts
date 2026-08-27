"use server";
import { improntaLog } from "@/lib/server/structured-log";

/**
 * Edit-mode server helpers + actions.
 *
 * Entering edit mode sets two cookies on the tenant public host:
 *   1. Preview JWT (HttpOnly) — unlocks the existing draft-render path. This
 *      is the same cookie the composer's Live Preview panel mints, so draft
 *      reads + revalidation already work end-to-end.
 *   2. Edit marker (non-HttpOnly) — a "1" so the client chrome knows to
 *      render the engaged shell instead of the idle pill.
 *
 * Exiting clears both and forces a soft refresh; the storefront re-renders
 * from the published snapshot and the shell falls back to the idle pill.
 *
 * Auth:
 *   - `requireSession`: signed in. (The doc used to say "super_admin or
 *     agency_staff" — that was the old global-app_role gate, removed in the
 *     PR #995 sweep because it locked hybrid workspace owners out of their own
 *     builder. Membership, not `profiles.app_role`, is the boundary.)
 *   - `requireEditSurfaceTenantScope`: caller has a resolved tenant scope matching the
 *     host — it fails closed without an `agency_memberships` row. The JWT's
 *     `tid` claim is set from this scope — middleware on the tenant host
 *     re-verifies, so a cross-tenant edit attempt would silently fail even if
 *     this guard were bypassed.
 *   - `agency.site_admin.pages.edit` on that resolved tenant: the SAME
 *     capability `EditChromeMount` uses to decide whether to render the Edit
 *     pill at all. Without it the entry point and the action disagreed — a
 *     `viewer`-role member saw no pill but could still POST this action
 *     directly and mint a preview JWT for the tenant's unpublished drafts.
 */

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantPreviewUrl } from "@/lib/site-admin/server/tenant-hosts";
import {
  PREVIEW_COOKIE_OPTIONS,
  previewCookieNameFor,
} from "@/lib/site-admin/preview/cookie";
import { signPreviewJwt } from "@/lib/site-admin/preview/jwt";
import {
  EDIT_COOKIE_OPTIONS,
  EDIT_COOKIE_VALUE,
  editCookieNameFor,
} from "./cookie";

/**
 * Result envelope for `enterEditModeAction`.
 *
 * The action stays compatible with `<form action={fn}>` (the form path
 * ignores the return value, so pre-hydration submits still flip edit mode
 * via the native browser submit). Once hydrated, the EditPill uses
 * `useActionState` to read this envelope and surface a non-silent failure
 * — staff who lack a tenant scope, or whose preview JWT minting failed,
 * see a real error chip instead of a no-op click.
 */
export interface EnterEditModeResult {
  ok: boolean;
  entered?: boolean;
  error?: string;
}

/**
 * Form-action compatible — signature matches `<form action={fn}>` so it runs
 * through native submit and works even before React hydration completes.
 * Errors are logged server-side AND returned for clients that read the
 * action result via `useActionState` (post-hydration error toasts).
 */
export async function enterEditModeAction(): Promise<EnterEditModeResult> {
  const auth = await requireSession();
  if (!auth.ok) {
    void improntaLog("site_admin_edit_mode.warn", {
      message: "[edit-mode] enter denied:",
      auth: auth.error,
    });
    return {
      ok: false,
      error: "You need to be signed in to your workspace to enter edit mode.",
    };
  }
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) {
    void improntaLog("site_admin_edit_mode.warn", { message: "[edit-mode] enter: no tenant scope" });
    return {
      ok: false,
      error: "Pick an agency workspace before opening the editor.",
    };
  }
  // Same capability EditChromeMount gates the pill on, so the entry point and
  // the action it fires can never disagree (see the AUTH note above).
  if (!(await userHasCapability("agency.site_admin.pages.edit", scope.tenantId))) {
    void improntaLog("site_admin_edit_mode.warn", {
      message: "[edit-mode] enter denied: membership role lacks pages.edit",
    });
    return {
      ok: false,
      error: "Your workspace role doesn't include editing the site.",
    };
  }

  try {
    const signed = signPreviewJwt({
      tenantId: scope.tenantId,
      actorProfileId: auth.user.id,
      subject: "homepage",
    });
    const jar = await cookies();
    jar.set({
      name: previewCookieNameFor(scope.tenantId),
      value: signed.token,
      ...PREVIEW_COOKIE_OPTIONS,
    });
    jar.set({
      name: editCookieNameFor(scope.tenantId),
      value: EDIT_COOKIE_VALUE,
      ...EDIT_COOKIE_OPTIONS,
    });
    revalidatePath("/", "layout");
    return { ok: true, entered: true };
  } catch (e) {
    void improntaLog("site_admin_edit_mode.warn", {
      message: "[edit-mode] enter failed:",
      error: String(e),
    });
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Could not start editing: ${e.message}`
          : "Could not start editing. Try again in a moment.",
    };
  }
}

export async function exitEditModeAction(): Promise<void> {
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return;
  const jar = await cookies();
  jar.delete(previewCookieNameFor(scope.tenantId));
  jar.delete(editCookieNameFor(scope.tenantId));
  revalidatePath("/", "layout");

  // "Exit to live site" means THIS tenant's live site. `redirect("/")` only
  // meant that on a tenant-owned host: on a custom domain or a workspace
  // subdomain, "/" is the storefront. Edit mode is equally reachable from the
  // PLATFORM host (app.tulala.digital / tulala.digital/w/<slug>), and there
  // "/" is the Tulala marketing homepage — so an operator leaving their own
  // editor landed on the product's sales page, on someone else's site.
  //
  // getTenantPreviewUrl already encodes the whole precedence (primary custom
  // domain -> workspace subdomain -> /w/<slug> path fallback, dev hosts
  // included), so the destination is resolved rather than assumed. A failure
  // here must never trap the operator inside edit mode: any problem falls back
  // to the old "/" behaviour, which is wrong-but-harmless on the platform host
  // and correct on a tenant host.
  let destination = "/";
  try {
    const admin = createServiceRoleClient();
    if (admin) {
      const hdrs = await headers();
      // Prefer the RAW Host header: it still carries the dev PORT. The
      // proxy's x-impronta-host-name is normalized through `normalize()`,
      // which strips ":3310" — so using it made "Exit to live site" always
      // resolve to localhost:3000 and land the operator on a dead origin
      // whenever the dev server ran on any other port (owner report
      // 2026-08-27). Consumers normalize the hostname themselves
      // (requestHostnameFromHostHeader), so the port is safe to pass along
      // and is ignored in production, where no port is ever appended.
      const requestHost =
        hdrs.get("host") ?? hdrs.get("x-impronta-host-name");
      const liveUrl = await getTenantPreviewUrl(admin, scope.tenantId, {
        requestHost,
      });
      if (liveUrl) destination = liveUrl;
    }
  } catch {
    // Fall through to "/" — see the note above.
  }
  redirect(destination);
}
