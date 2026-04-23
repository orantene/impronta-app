"use server";

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
 *   - `requireStaff`: must be super_admin or agency_staff
 *   - `requireTenantScope`: caller has a resolved tenant scope matching the
 *     host. The JWT's `tid` claim is set from this scope — middleware on the
 *     tenant host re-verifies, so a cross-tenant edit attempt would silently
 *     fail even if this guard were bypassed.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
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
 * Form-action compatible — signature matches `<form action={fn}>` so it runs
 * through native submit and works even before React hydration completes.
 * Errors are logged server-side; the chrome falls back to the idle state on
 * failure since the cookies were never written.
 */
export async function enterEditModeAction(): Promise<void> {
  const auth = await requireStaff();
  if (!auth.ok) {
    console.warn("[edit-mode] enter denied:", auth.error);
    return;
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    console.warn("[edit-mode] enter: no tenant scope");
    return;
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
  } catch (e) {
    console.warn("[edit-mode] enter failed:", e);
  }
}

export async function exitEditModeAction(): Promise<void> {
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return;
  const jar = await cookies();
  jar.delete(previewCookieNameFor(scope.tenantId));
  jar.delete(editCookieNameFor(scope.tenantId));
  revalidatePath("/", "layout");
}
