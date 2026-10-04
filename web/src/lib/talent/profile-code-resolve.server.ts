import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  normalizeTalentProfileCodeInput,
  resolveTalentProfileCode,
  type ResolvedTalentProfileCode,
} from "@/lib/talent/profile-code";

/** Resolve without redirect — for metadata / OG / soft lookups. */
export async function resolveTalentProfileCodeQuiet(
  rawCode: string,
): Promise<ResolvedTalentProfileCode | null> {
  const requestedCode = normalizeTalentProfileCodeInput(rawCode);
  if (!requestedCode) return null;

  const client =
    createPublicSupabaseClient() ?? createServiceRoleClient() ?? null;
  if (!client) return null;

  return resolveTalentProfileCode(client, requestedCode);
}
