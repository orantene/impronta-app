import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveInquiryRecipients } from "./recipients";
import { emitNotification } from "./emit";

// C3 — @mention notifications for inquiry thread messages.
//
// The composer renders mentions as plain `@Name` tokens (the message renderer
// in messages/shared/machinery-15.tsx splits on /(@[A-Z][\w-]*)/g — a single
// capitalized word, typically a first name). There is no structured
// `@[Name](user_id)` token and no mention column, so this resolves tokens to
// user ids by fuzzy-matching against the inquiry participants' display names.
//
// This is best-effort and MUST NOT block or fail the send: callers fire it
// and forget. It self-resolves a service-role client (same trust model as the
// rest of the notification infra) because it needs the full participant +
// profile set, not the caller's RLS-filtered view.

/** Token regex: `@` + a capitalized word (letters/digits/underscore/hyphen). */
const MENTION_TOKEN = /@([A-Z][\w-]*)/g;

/** Normalize a name token for loose comparison (lowercase, alnum only). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Extract the distinct lowercased mention tokens from a message body. */
export function parseMentionTokens(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_TOKEN.lastIndex = 0;
  while ((m = MENTION_TOKEN.exec(body)) !== null) {
    if (m[1]) out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

type SurfaceFor = "workspace" | "talent" | "client";

/**
 * Notify any inquiry participants @mentioned in `body`.
 *
 * Matching: each `@Token` is compared (normalized) against every candidate
 * participant's display name AND its first-name token. A candidate matches when
 * the @token equals either the normalized first name or a prefix of the
 * normalized full name (so `@Sofia` matches "Sofía Herrera").
 *
 * Fallback (per the C3 contract): if the body contains at least one `@` but no
 * token resolves to a participant, notify every non-sender participant — better
 * an over-notify than a silently-dropped mention.
 *
 * Returns the set of user ids notified (for tests / callers); empty on any
 * short-circuit. Never throws.
 */
export async function notifyMentionedParticipants(
  _supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    threadType: "private" | "group";
    body: string;
    messageId?: string | null;
  },
): Promise<string[]> {
  try {
    const tokens = parseMentionTokens(ctx.body);
    // No mention syntax at all → nothing to do (the "@" fallback only applies
    // once an actual @Token exists; a bare "@" with no word never matches the
    // composer's render regex either).
    if (tokens.length === 0) return [];

    const admin = createServiceRoleClient();
    if (!admin) return [];

    const recipients = await resolveInquiryRecipients(_supabase, ctx.inquiryId, ctx.tenantId);

    // Build the candidate pool: which user ids are reachable on this thread,
    // and which surface to route each to. Private threads are staff-internal,
    // so only workspace users are candidates there; group threads reach
    // workspace + talent + client.
    const surfaceByUser = new Map<string, SurfaceFor>();
    for (const id of recipients.workspaceUserIds) {
      if (id !== ctx.actorUserId) surfaceByUser.set(id, "workspace");
    }
    if (ctx.threadType === "group") {
      for (const id of recipients.talentUserIds) {
        if (id !== ctx.actorUserId && !surfaceByUser.has(id)) surfaceByUser.set(id, "talent");
      }
      if (recipients.clientUserId && recipients.clientUserId !== ctx.actorUserId) {
        if (!surfaceByUser.has(recipients.clientUserId)) {
          surfaceByUser.set(recipients.clientUserId, "client");
        }
      }
    }

    const candidateIds = Array.from(surfaceByUser.keys());
    if (candidateIds.length === 0) return [];

    // Resolve display names for the candidate users (profiles + talent_profiles
    // mirror). profiles.display_name / full_name cover staff + client + talent
    // accounts; talent_profiles.display_name is a stage-name fallback some
    // talent use in threads.
    const nameByUser = new Map<string, string[]>(); // userId → [name variants]
    const pushName = (userId: string, name: string | null | undefined) => {
      const v = (name ?? "").trim();
      if (!v) return;
      const arr = nameByUser.get(userId) ?? [];
      arr.push(v);
      nameByUser.set(userId, arr);
    };

    const [{ data: profileRows }, { data: talentRows }] = await Promise.all([
      admin.from("profiles").select("id, display_name, full_name").in("id", candidateIds),
      admin
        .from("talent_profiles")
        .select("user_id, display_name, full_name")
        .in("user_id", candidateIds),
    ]);

    for (const p of (profileRows ?? []) as Array<{
      id: string;
      display_name: string | null;
      full_name: string | null;
    }>) {
      pushName(p.id, p.display_name);
      pushName(p.id, p.full_name);
    }
    for (const t of (talentRows ?? []) as Array<{
      user_id: string | null;
      display_name: string | null;
      full_name: string | null;
    }>) {
      if (!t.user_id) continue;
      pushName(t.user_id, t.display_name);
      pushName(t.user_id, t.full_name);
    }

    // Match tokens → users.
    const matched = new Set<string>();
    for (const userId of candidateIds) {
      const names = nameByUser.get(userId) ?? [];
      for (const name of names) {
        const full = norm(name);
        const first = norm(name.split(/\s+/)[0] ?? "");
        const hit = tokens.some((tok) => {
          const t = norm(tok);
          if (!t) return false;
          return t === first || (full.length > 0 && full.startsWith(t) && t.length >= 2);
        });
        if (hit) {
          matched.add(userId);
          break;
        }
      }
    }

    // Fallback: a mention token exists but resolved to nobody (name mismatch,
    // missing profile name, etc.) → notify all non-sender candidates.
    const targets = matched.size > 0 ? Array.from(matched) : candidateIds;
    if (targets.length === 0) return [];

    const snippet = ctx.body.length > 120 ? `${ctx.body.slice(0, 117)}…` : ctx.body;
    const targetDrawerFor = (s: SurfaceFor): string =>
      s === "workspace" ? "inquiry-workspace" : s === "talent" ? "talent-inquiry" : "client-inquiry";

    await Promise.all(
      targets.map((userId) => {
        const surface = surfaceByUser.get(userId) ?? "workspace";
        return emitNotification({
          userId,
          tenantId: ctx.tenantId,
          kind: "message",
          surface,
          title: "You were mentioned",
          body: snippet,
          actorUserId: ctx.actorUserId,
          targetDrawer: targetDrawerFor(surface),
          targetPayload: { inquiryId: ctx.inquiryId, threadType: ctx.threadType },
          // Idempotency: one mention notification per (message, user). Falls back
          // to a per-inquiry key when the message id is unavailable.
          originEventId: ctx.messageId ? `mention:${ctx.messageId}:${userId}` : null,
          originKind: "message_mention",
          originInquiryId: ctx.inquiryId,
        });
      }),
    );

    return targets;
  } catch (err) {
    logServerError("notifications.mention-notify", err);
    return [];
  }
}
