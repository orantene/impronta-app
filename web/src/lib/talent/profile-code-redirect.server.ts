import "server-only";

import { permanentRedirect } from "next/navigation";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  normalizeTalentProfileCodeInput,
  resolveTalentProfileCode,
  talentProfileAliasRedirectPath,
  type ResolvedTalentProfileCode,
} from "@/lib/talent/profile-code";

/**
 * Resolve a /t/<code> segment. When the segment is a retired vanity alias,
 * permanently redirect to the live numeric code (Next.js permanentRedirect =
 * HTTP 308, the permanent redirect used elsewhere on public talent URLs).
 *
 * Returns the live resolution when the code is already canonical (or when the
 * RPC is unavailable — callers still do their own not-found path).
 */
export async function resolveOrRedirectTalentProfileCode(
  rawCode: string,
  opts?: {
    /** Full pathname including `/t/<code>` (and optional suffix). */
    pathname?: string;
    /** Query string including leading `?`, or empty. */
    search?: string;
  },
): Promise<ResolvedTalentProfileCode | null> {
  const requestedCode = normalizeTalentProfileCodeInput(rawCode);
  if (!requestedCode) return null;

  const client =
    createPublicSupabaseClient() ?? createServiceRoleClient() ?? null;
  if (!client) return null;

  const resolved = await resolveTalentProfileCode(client, requestedCode);
  if (!resolved) return null;

  if (resolved.isAlias && resolved.profileCode !== requestedCode) {
    const pathname = opts?.pathname ?? `/t/${requestedCode}`;
    const target =
      talentProfileAliasRedirectPath({
        canonicalCode: resolved.profileCode,
        pathname,
        requestedCode,
        search: opts?.search ?? "",
      }) ?? `/t/${encodeURIComponent(resolved.profileCode)}${opts?.search ?? ""}`;
    permanentRedirect(target);
  }

  return resolved;
}
