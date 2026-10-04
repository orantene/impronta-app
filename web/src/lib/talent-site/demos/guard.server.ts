import "server-only";

/**
 * The one door every demo rebuild / restore goes through. A talent is a valid
 * target ONLY when all three hold: `talent_profiles.is_demo = true`, its auth
 * user is a demo account (`isDemoAccount(email, app_metadata.demo_batch)`), and
 * its code is in DEMO_REGISTRY. Never `is_test_account`. Jor, the QA users and
 * every real talent fail one of the three and are refused BEFORE any read of
 * their site rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoAccount } from "@/lib/talent-site/theme-catalog/demo-account";
import { findDemo } from "./registry";

export type DemoTargetDecision =
  | { ok: true }
  | { ok: false; reason: string };

export interface DemoTargetFacts {
  profileCode: string;
  inRegistry: boolean;
  isDemoFlag: boolean | null | undefined;
  email: string | null | undefined;
  demoBatch: unknown;
}

/** PURE: the allow/refuse decision. */
export function decideDemoTarget(f: DemoTargetFacts): DemoTargetDecision {
  if (!f.inRegistry) return { ok: false, reason: `${f.profileCode} is not in the demo registry.` };
  if (f.isDemoFlag !== true) return { ok: false, reason: `${f.profileCode} is not flagged as a demo profile.` };
  if (!isDemoAccount(f.email, f.demoBatch)) return { ok: false, reason: `${f.profileCode} is not a demo account.` };
  return { ok: true };
}

export type DemoTarget =
  | { ok: true; talentProfileId: string; siteId: string | null; userId: string }
  | { ok: false; reason: string };

export async function assertDemoTarget(admin: SupabaseClient, profileCode: string): Promise<DemoTarget> {
  // Registry first: a code outside it is refused without touching the database.
  if (!findDemo(profileCode)) return { ok: false, reason: `${profileCode} is not in the demo registry.` };
  const { data: tp, error } = await admin
    .from("talent_profiles")
    .select("id, user_id, is_demo")
    .eq("profile_code", profileCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { ok: false, reason: `${profileCode}: could not read the profile.` };
  if (!tp) return { ok: false, reason: `${profileCode} was not found on this project.` };
  const row = tp as { id: string; user_id: string | null; is_demo: boolean | null };
  if (row.is_demo !== true) return { ok: false, reason: `${profileCode} is not flagged as a demo profile.` };
  if (!row.user_id) return { ok: false, reason: `${profileCode} has no account.` };
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(row.user_id);
  if (uErr) return { ok: false, reason: `${profileCode}: could not read the account.` };
  const decision = decideDemoTarget({
    profileCode,
    inRegistry: true,
    isDemoFlag: row.is_demo,
    email: u.user?.email,
    demoBatch: u.user?.app_metadata?.demo_batch,
  });
  if (!decision.ok) return decision;
  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", row.id)
    .maybeSingle();
  if (siteErr) return { ok: false, reason: `${profileCode}: could not read the site.` };
  return { ok: true, talentProfileId: row.id, siteId: (site as { id: string } | null)?.id ?? null, userId: row.user_id };
}
