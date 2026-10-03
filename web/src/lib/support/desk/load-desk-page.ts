import "server-only";

import { notFound, redirect } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadSupportCannedReplies } from "@/lib/platform/support-canned";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { decideDeskAccess } from "@/lib/support/desk/desk-access";
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

export type DeskPageResult =
  | { ok: true; data: DeskPageData }
  | { ok: false; reason: "forbidden"; email: string | null };

/**
 * Shared gate + loader for `/desk`.
 * Flag off → soft 404. Unauthed → login. Non–platform-admin → honest forbidden
 * (never soft 404 — that lied to Oran when a talent session hit `/desk`).
 * Loads the same HQ Support payload so the portal can mount `SupportHqShell`.
 */
export async function loadDeskPage(opts: {
  ticketId?: string | null;
  view?: string | null;
  loginNext: string;
}): Promise<DeskPageResult> {
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");

  const decision = decideDeskAccess({
    flagEnabled: isSupportDeskEnabled(),
    hasUser: Boolean(session.user),
    isPlatformAdmin: isPlatformAdmin(session.profile),
  });

  if (decision.allow === false && decision.reason === "flag_off") notFound();
  if (decision.allow === false && decision.reason === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent(opts.loginNext)}`);
  }
  if (decision.allow === false && decision.reason === "forbidden") {
    return {
      ok: false,
      reason: "forbidden",
      email: session.user?.email ?? null,
    };
  }

  // decision.allow === true → session.user is set
  const user = session.user!;

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
    ok: true,
    data: {
      rows,
      cannedReplies,
      insights,
      ideas,
      initialTicketId: opts.ticketId ?? null,
      initialView,
      selfUserId: user.id,
    },
  };
}
