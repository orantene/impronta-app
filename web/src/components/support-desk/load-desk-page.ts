import "server-only";

import { redirect, notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { loadHqSupportQueue, type HqQueueRow } from "@/lib/support/load-hq";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";

export type DeskPageData = {
  rows: HqQueueRow[];
  cannedReplies: Awaited<ReturnType<typeof loadSupportCannedReplies>>;
  initialTicketId: string | null;
};

/** Shared gate + load for `/desk` and local QA `/platform/admin/support/desk`. */
export async function loadDeskPage(opts: {
  ticketId?: string | null;
  loginNext: string;
}): Promise<DeskPageData> {
  if (!isSupportDeskEnabled()) notFound();

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(opts.loginNext)}`);
  }
  if (!isPlatformAdmin(session.profile)) notFound();

  const [rows, cannedReplies] = await Promise.all([
    loadHqSupportQueue(),
    loadSupportCannedReplies(),
  ]);

  const initialTicketId =
    opts.ticketId && rows.some((r) => r.ticket.id === opts.ticketId)
      ? opts.ticketId
      : rows[0]?.ticket.id ?? null;

  return { rows, cannedReplies, initialTicketId };
}
