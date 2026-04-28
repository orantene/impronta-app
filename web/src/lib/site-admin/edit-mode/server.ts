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
import { redirect } from "next/navigation";

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
  error?: string;
}

/**
 * Form-action compatible — signature matches `<form action={fn}>` so it runs
 * through native submit and works even before React hydration completes.
 * Errors are logged server-side AND returned for clients that read the
 * action result via `useActionState` (post-hydration error toasts).
 */
export async function enterEditModeAction(): Promise<EnterEditModeResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    console.warn("[edit-mode] enter denied:", auth.error);
    return {
      ok: false,
      error: "You need to be signed in as staff to enter edit mode.",
    };
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    console.warn("[edit-mode] enter: no tenant scope");
    return {
      ok: false,
      error: "Pick an agency workspace before opening the editor.",
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
    return { ok: true };
  } catch (e) {
    console.warn("[edit-mode] enter failed:", e);
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
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return;
  const jar = await cookies();
  jar.delete(previewCookieNameFor(scope.tenantId));
  jar.delete(editCookieNameFor(scope.tenantId));
  revalidatePath("/", "layout");
  redirect("/");
}
