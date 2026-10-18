import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertDemoTarget } from "@/lib/talent-site/demos/guard.server";

/**
 * TUL-1246 (P0). The theme preview may render a talent the viewer does NOT own
 * only when that talent is a real seeded DEMO: in the demo registry, flagged
 * `talent_profiles.is_demo = true`, and its auth user a demo account
 * (`isDemoAccount`). The gallery-meta allow-list names a profile CODE; a code
 * alone is not proof the row behind it is still a demo (a polluted or reused
 * row would otherwise paint someone's real name, phone and city into every
 * other talent's design picker). Fails closed: any doubt is "not a demo".
 */
export async function previewMayRenderDemoTalent(
  admin: SupabaseClient,
  profileCode: string,
): Promise<{ ok: true; talentProfileId: string } | { ok: false; reason: string }> {
  const target = await assertDemoTarget(admin, profileCode);
  if (!target.ok) return { ok: false, reason: target.reason };
  return { ok: true, talentProfileId: target.talentProfileId };
}
