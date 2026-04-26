"use server";

/**
 * Phase 8 — talent-profile path lookup for the LinkPicker's "talent" mode.
 *
 * Returns the public canonical path (`/t/<profile_code>`) plus
 * display_name for every talent on the tenant's roster. Lightweight —
 * no search, just a flat list (the picker's own UI handles filtering).
 * Cached via `unstable_cache` keyed on tenant + a short TTL so the
 * picker feels instant on repeat opens.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface TalentPathOption {
  path: string;
  label: string;
  profileCode: string;
}

export type TalentPathListResult =
  | { ok: true; talent: ReadonlyArray<TalentPathOption> }
  | { ok: false; error: string };

export async function loadTalentPathsForLinkPicker(): Promise<TalentPathListResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  // Two-step: roster ids → talent_profiles. Mirrors the talent-search
  // action's pattern so we honor the same roster gate.
  const { data: rosterRows } = await admin
    .from("agency_roster")
    .select("talent_profile_id")
    .eq("tenant_id", scope.tenantId)
    .is("removed_at", null);
  const rosterIds = ((rosterRows ?? []) as Array<{ talent_profile_id: string }>).map(
    (r) => r.talent_profile_id,
  );
  if (rosterIds.length === 0) return { ok: true, talent: [] };

  const { data, error } = await admin
    .from("talent_profiles")
    .select("profile_code, display_name")
    .in("id", rosterIds)
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .limit(200);
  if (error) return { ok: false, error: "Couldn't load talent — try again." };

  type Row = { profile_code: string | null; display_name: string | null };
  const talent: TalentPathOption[] = ((data ?? []) as Row[])
    .filter((r) => r.profile_code && r.display_name)
    .map((r) => ({
      path: `/t/${r.profile_code}`,
      label: r.display_name!,
      profileCode: r.profile_code!,
    }));
  return { ok: true, talent };
}
