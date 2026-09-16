"use server";

/**
 * The shell's one round trip for the bridge slices the layout did not load.
 *
 * Same gate as the layout (`getTenantScopeBySlug` + `agency.workspace.view`),
 * same loaders, same degrade-to-empty contract. The caller names the slices;
 * unknown names are dropped rather than refused, so an older shell asking
 * for a slice this build no longer knows still gets the ones it does.
 */

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isBridgeSliceName, type BridgeSliceName } from "@/components/admin/shell/internal/bridge-slices";
import { loadBridgeSlices, type BridgeSlicePayload } from "./_bridge-slices.server";

export type LoadBridgeSlicesResult =
  | { ok: true; slices: BridgeSlicePayload; loaded: BridgeSliceName[] }
  | { ok: false; error: string };

export async function loadBridgeSlicesAction(
  tenantSlug: string,
  names: readonly string[],
): Promise<LoadBridgeSlicesResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Not a member of this workspace." };
  const [canView, canManageBilling] = await Promise.all([
    userHasCapability("agency.workspace.view", scope.tenantId),
    userHasCapability("manage_billing", scope.tenantId),
  ]);
  if (!canView) return { ok: false, error: "Not authorized." };

  const wanted = names.filter(isBridgeSliceName);
  const slices = await loadBridgeSlices(
    { tenantId: scope.tenantId, tenantSlug, canManageBilling },
    wanted,
  );
  return { ok: true, slices, loaded: wanted };
}
