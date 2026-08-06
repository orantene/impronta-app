"use server";

/**
 * admin-discover-exposure.ts — WRITE/admin side of the per-tenant Discover and
 * hub exposure control. Powers workspace Settings → Discover.
 *
 * Auth: requireStaffTenantAction() resolves the caller's tenant from the
 * session; tenant_id is taken from that scope and NEVER from client input, so
 * a workspace can only ever change its own exposure.
 *
 * The Discover grid enforces `discover_exposure_enabled` inside the
 * `talent_discover_index` matview. That index is refreshed on a 15-minute cron,
 * so a change here is not instant on the public grid — the save path asks for a
 * refresh and the UI says so rather than pretending it took effect at once.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_TENANT_DISCOVER_EXPOSURE,
  mapTenantDiscoverExposure,
  type TenantDiscoverExposure,
} from "@/lib/saas/discover-exposure";

export type HubOption = { id: string; slug: string; displayName: string };

export type LoadDiscoverExposureResult =
  | { ok: true; data: TenantDiscoverExposure; hubs: HubOption[] }
  | { ok: false; error: string };

export type SaveDiscoverExposureResult = { ok: true } | { ok: false; error: string };

const saveSchema = z.object({
  discoverExposureEnabled: z.boolean(),
  /** null = every hub allowed. An explicit list (possibly empty) narrows it. */
  hubExposureTenantIds: z.array(z.string().uuid()).nullable(),
});

export type SaveDiscoverExposureInput = z.infer<typeof saveSchema>;

/** Current exposure config + the hubs this workspace can choose between. */
export async function loadDiscoverExposure(): Promise<LoadDiscoverExposureResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const [{ data: row, error }, { data: hubRows, error: hubErr }] = await Promise.all([
    // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; looked up by its primary key
    supabase
      .from("agencies")
      .select("discover_exposure_enabled, hub_exposure_tenant_ids")
      .eq("id", tenantId)
      .maybeSingle(),
    // eslint-disable-next-line ratchet/no-untenanted-from -- deliberate cross-tenant read: the hub picker lists OTHER tenants (kind=hub) by design; no tenant data is exposed beyond public id/slug/name
    supabase
      .from("agencies")
      .select("id, slug, display_name")
      .eq("kind", "hub")
      .eq("status", "active")
      .order("display_name", { ascending: true }),
  ]);

  if (error) {
    logServerError("admin-discover-exposure.load", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  if (hubErr) {
    logServerError("admin-discover-exposure.load.hubs", hubErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return {
    ok: true,
    data: row ? mapTenantDiscoverExposure(row) : DEFAULT_TENANT_DISCOVER_EXPOSURE,
    hubs: (hubRows ?? []).map((h) => ({
      id: h.id as string,
      slug: h.slug as string,
      displayName: (h.display_name as string | null) ?? (h.slug as string),
    })),
  };
}

/** Persist the workspace's exposure choice. */
export async function saveDiscoverExposure(
  input: SaveDiscoverExposureInput,
): Promise<SaveDiscoverExposureResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; the write is pinned to the session's own tenantId via .eq("id", tenantId)
  const { error } = await supabase
    .from("agencies")
    .update({
      discover_exposure_enabled: parsed.data.discoverExposureEnabled,
      hub_exposure_tenant_ids: parsed.data.hubExposureTenantIds,
    })
    .eq("id", tenantId);

  if (error) {
    logServerError("admin-discover-exposure.save", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Best-effort: pull the public grid forward instead of waiting out the cron.
  // A failure here is not a save failure — the cron still catches up.
  const { error: refreshErr } = await supabase.rpc("refresh_talent_discover_index");
  if (refreshErr) {
    logServerError("admin-discover-exposure.refresh", refreshErr);
  }

  revalidatePath("/[tenantSlug]/admin/settings/discover", "page");
  return { ok: true };
}
