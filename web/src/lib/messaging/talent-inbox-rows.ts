import "server-only";

import { loadMessagingInbox } from "@/lib/messaging/inbox";
import { countAwaitingReply } from "@/lib/messages-v5/inbox-view";
import { filterQaFixtureInboxRows, talentKeepsFixtureThreads } from "@/lib/messages-v5/qa-fixture-row";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

import type { EffectiveReadContext } from "@/lib/impersonation/effective-read";

import { loadTalentActor, listTalentInquiryIds, type TalentActorDeps } from "./talent-actor";
import { talentIsSeller } from "./talent-pov";
import type { InboxFilter } from "./types";

type Actor = Extract<Awaited<ReturnType<typeof loadTalentActor>>, { ok: true }>;

/**
 * The ONE definition of "the conversations this talent can see in Messages".
 * Messages (`messagingTalentLoadInbox`) and the notification bell/badge
 * (`loadTalentInboxSummary`) both read through here, so the two counts
 * cannot drift (TUL-52 B: bell said 25 unread, Messages showed 0).
 */
export async function loadTalentInboxForActor(actor: Actor, filter: InboxFilter) {
  // TUL-625: the hub lookup does not depend on the id scan; start it first so it
  // resolves while the scans and the inbox read run instead of after them.
  const hubPromise = getPlatformHubTenant().catch(() => null);
  const listed = await listTalentInquiryIds(actor.admin, actor.talentProfileId);
  if (!listed.ok) return listed;
  const inbox = await loadMessagingInbox(actor.admin, {
    tenantId: "",
    locationSlug: "all",
    filter,
    actorUserId: actor.userId,
    onlyInquiryIds: listed.ids,
  });
  if (!inbox.ok) return inbox;
  // Her own hub sales are hers; every other tenant's thread is an agency's.
  const hub = await hubPromise;
  let rows = inbox.rows.map((row) => ({ ...row, agency: !talentIsSeller(row.tenantId, hub?.tenantId ?? null) }));
  let unreadCount = inbox.unreadCount;
  // Live talents: hide agent/journey fixture threads from the inbox. Demo
  // talents and QA accounts keep them: those are the fixture surfaces.
  if (!talentKeepsFixtureThreads(actor)) {
    const filtered = filterQaFixtureInboxRows(rows);
    rows = filtered.rows;
    unreadCount = filtered.unreadCount;
  }
  return { ...inbox, rows, unreadCount };
}

export type TalentInboxSummary = {
  /** Inquiry ids that appear in this talent's Messages list. */
  ids: Set<string>;
  /** The inbox's own unread count. */
  unreadCount: number;
  /** The inbox "Needs reply" count (same predicate as the Messages list). */
  needsReply: number;
};

/**
 * What Messages shows this talent, for the shell: the visible ids (bell scope)
 * and the inbox's own counts, so the Messages and Attention bubbles say what
 * the inbox says (TUL-387/388: bubble 1 vs inbox 4). Null when it cannot be
 * resolved.
 */
export async function loadTalentInboxSummary(
  /** TUL-245: from `effectiveReadContext` only. */
  ctx?: EffectiveReadContext,
  deps?: TalentActorDeps,
): Promise<TalentInboxSummary | null> {
  const actor = await loadTalentActor(ctx, deps);
  if (!actor.ok) return null;
  const inbox = await loadTalentInboxForActor(actor, "all");
  if (!inbox.ok) return null;
  return {
    ids: new Set(inbox.rows.map((row) => row.id)),
    unreadCount: inbox.unreadCount,
    needsReply: countAwaitingReply(inbox.rows),
  };
}
