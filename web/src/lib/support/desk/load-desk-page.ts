import "server-only";

import { notFound, redirect } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { loadHqFeatureRequests } from "@/lib/support/feature-requests";
import { loadHqInsightsDashboard } from "@/lib/support/insights/load";
import { loadHqSupportQueue } from "@/lib/support/load-hq";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { HqFeatureRequestRow } from "@/lib/support/feature-request-types";
import type { HqInsightsDashboard } from "@/lib/support/insights/types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";

export type DeskPageData = {
  rows: HqQueueRow[];
  cannedReplies: SupportCannedReply[];
  insights: HqInsightsDashboard;
  ideas: HqFeatureRequestRow[];
  initialTicketId: string | null;
  initialView: "queue" | "insights" | "ideas";
  selfUserId: string | null;
};

/**
 * Shared gate + loader for `/desk`.
 * Flag off → 404. Unauthed → login. Non–platform-admin → 404.
 * Loads the same HQ Support payload so the portal can mount `SupportHqShell`.
 */
export async function loadDeskPage(opts: {
  ticketId?: string | null;
  view?: string | null;
  loginNext: string;
}): Promise<DeskPageData> {
  if (!isSupportDeskEnabled()) notFound();

  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(opts.loginNext)}`);
  }
  if (!isPlatformAdmin(session.profile)) notFound();

  const [rows, cannedReplies, insights, ideas] = await Promise.all([
    loadHqSupportQueue(),
    loadSupportCannedReplies(),
    loadHqInsightsDashboard(),
    loadHqFeatureRequests(),
  ]);

  const view = opts.view;
  const initialView =
    view === "insights" ? "insights" : view === "ideas" ? "ideas" : "queue";

  return {
    rows,
    cannedReplies,
    insights,
    ideas,
    initialTicketId: opts.ticketId ?? null,
    initialView,
    selfUserId: session.user.id,
  };
}
