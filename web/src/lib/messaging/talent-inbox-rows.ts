import "server-only";

import { loadMessagingInbox } from "@/lib/messaging/inbox";
import { filterQaFixtureInboxRows } from "@/lib/messages-v5/qa-fixture-row";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";

import { loadTalentActor, listTalentInquiryIds } from "./talent-actor";
import { talentIsSeller } from "./talent-pov";
import type { InboxFilter } from "./types";

type Actor = Extract<Awaited<ReturnType<typeof loadTalentActor>>, { ok: true }>;

/**
 * The ONE definition of "the conversations this talent can see in Messages".
 * Messages (`messagingTalentLoadInbox`) and the notification bell/badge
 * (`loadTalentVisibleInquiryIds`) both read through here, so the two counts
 * cannot drift (TUL-52 B: bell said 25 unread, Messages showed 0).
 */
export async function loadTalentInboxForActor(actor: Actor, filter: InboxFilter) {
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
  const hub = await getPlatformHubTenant();
  let rows = inbox.rows.map((row) => ({ ...row, agency: !talentIsSeller(row.tenantId, hub?.tenantId ?? null) }));
  let unreadCount = inbox.unreadCount;
  // Live talents: hide agent/journey fixture threads from the inbox. Demo
  // talents keep them: that account is the fixture surface for QA.
  if (!actor.isDemo) {
    const filtered = filterQaFixtureInboxRows(rows);
    rows = filtered.rows;
    unreadCount = filtered.unreadCount;
  }
  return { ...inbox, rows, unreadCount };
}

/** Inquiry ids that appear in this talent's Messages list; null when it cannot be resolved. */
export async function loadTalentVisibleInquiryIds(): Promise<Set<string> | null> {
  const actor = await loadTalentActor();
  if (!actor.ok) return null;
  const inbox = await loadTalentInboxForActor(actor, "all");
  if (!inbox.ok) return null;
  return new Set(inbox.rows.map((row) => row.id));
}
