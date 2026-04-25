import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Analytics consolidation.
 *
 * The standalone /overview tab moved to /admin/analytics itself
 * (KPIs + GA4 strip + deep-link cards). Redirect preserves bookmarks.
 */
export default function AdminAnalyticsOverviewPage() {
  redirect("/admin/analytics");
}
