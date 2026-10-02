import "server-only";

import { notFound, redirect } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { loadHqSupportQueue } from "@/lib/support/load-hq";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { SupportCannedReply } from "@/lib/platform/support-canned";

export type DeskPageData = {
  rows: HqQueueRow[];
  cannedReplies: SupportCannedReply[];
  initialTicketId: string | null;
  selfUserId: string | null;
};

/**
 * Shared gate + loader for `/desk` and the local-QA redirect target.
 * Flag off → 404. Unauthed → login. Non–platform-admin → 404.
 */
export async function loadDeskPage(opts: {
  ticketId?: string | null;
  loginNext: string;
}): Promise<DeskPageData> {
  if (!isSupportDeskEnabled()) notFound();

  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(opts.loginNext)}`);
  }
  if (!isPlatformAdmin(session.profile)) notFound();

  const [rows, cannedReplies] = await Promise.all([
    loadHqSupportQueue(),
    loadSupportCannedReplies(),
  ]);

  return {
    rows,
    cannedReplies,
    initialTicketId: opts.ticketId ?? null,
    selfUserId: session.user.id,
  };
}
