import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type {
  AudienceContext,
  AudienceMember,
  ResolvedRecipient,
} from "./types";

/**
 * Audience hydration (spec §2.2).
 *
 * Catalog `resolveAudience` functions return lightweight `AudienceMember`s
 * (a user id, or a guest email). The dispatcher needs fully-hydrated
 * `ResolvedRecipient`s — email address, display name, locale, dedupe id — so
 * hydration is centralized here and reused by every entry. This keeps the
 * audience resolvers small (they just decide *who*, not *how to reach them*).
 */

/** Build the shared service-role context handed to resolvers + handlers. */
export function buildAudienceContext(): AudienceContext | null {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return { admin };
}

export async function hydrateRecipient(
  member: AudienceMember,
  ctx: AudienceContext,
): Promise<ResolvedRecipient | null> {
  if (member.kind === "guest") {
    const email = member.email?.trim();
    if (!email) return null;
    return {
      userId: null,
      email,
      displayName: member.displayName ?? null,
      locale: "en",
      isPlatformAdmin: false,
      role: member.role ?? "guest",
      dedupeId: `guest:${email.toLowerCase()}`,
    };
  }

  let email: string | null = null;
  let displayName: string | null = null;
  try {
    const { data, error } = await ctx.admin.auth.admin.getUserById(member.userId);
    if (error) {
      logServerError("notifications.hydrate.getUser", error);
    } else if (data?.user) {
      email = data.user.email ?? null;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const name = meta.full_name ?? meta.name ?? meta.display_name;
      displayName = typeof name === "string" ? name : null;
    }
  } catch (err) {
    logServerError(
      "notifications.hydrate.getUser",
      err instanceof Error ? err : new Error(String(err)),
    );
  }

  return {
    userId: member.userId,
    email,
    displayName,
    locale: "en",
    isPlatformAdmin: member.role === "platform_admin",
    role: member.role ?? "workspace_member",
    dedupeId: member.userId,
  };
}

/**
 * Hydrate a list of members, dropping unreachable ones and deduplicating by
 * `dedupeId` (the same person can be resolved by two entries / paths).
 */
export async function hydrateAudience(
  members: AudienceMember[],
  ctx: AudienceContext,
): Promise<ResolvedRecipient[]> {
  const seen = new Set<string>();
  const out: ResolvedRecipient[] = [];
  for (const member of members) {
    const recipient = await hydrateRecipient(member, ctx);
    if (!recipient) continue;
    if (seen.has(recipient.dedupeId)) continue;
    seen.add(recipient.dedupeId);
    out.push(recipient);
  }
  return out;
}
