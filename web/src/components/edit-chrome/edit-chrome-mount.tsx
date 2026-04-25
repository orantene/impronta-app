/**
 * EditChromeMount — server gate for the in-place editor.
 *
 * Rules:
 *   1. Only renders on tenant hosts (agency or hub); marketing/app/unknown
 *      hosts get nothing.
 *   2. Only renders for authenticated staff (super_admin or agency_staff).
 *      Talent / clients / unauthenticated visitors see nothing.
 *   3. Reads the edit cookie server-side to tell the client which mode to
 *      mount in (pill vs shell) — avoids a client flash from idle→engaged.
 *
 * Import this from the root layout. It's safe on every path because it
 * short-circuits on hostless/anonymous requests.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { getPublicHostContext } from "@/lib/saas/scope";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { resolveStorefrontLocale } from "@/lib/site-admin/server/storefront-locale";
import { EditChrome } from "./edit-chrome";

export async function EditChromeMount() {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") return null;

  const staff = await requireStaff();
  if (!staff.ok) return null;

  const editActive = await isEditModeActiveForTenant(ctx.tenantId);
  // Resolve the request's effective locale so the editor loads the matching
  // homepage row (composer used to expose this via the ?locale= query; the
  // in-place editor inherits the storefront's locale resolution instead).
  const localeContext = await resolveStorefrontLocale();
  return (
    <EditChrome
      tenantId={ctx.tenantId}
      editActive={editActive}
      locale={localeContext.locale}
    />
  );
}
