// TUL-1274: talent dashboard mount reads as a plain GET.
//
// SettingsPage, TalentInstagramCard, TalentSiteActivateNudge, useWebsiteFlow
// and useVerifiedLiveBadge used to call these readers as server actions from
// mount effects. A server action answered while a cookie was written for the
// request (a session refresh) comes back "revalidated" and the client router
// refetches the whole RSC tree, which reset the tab title, closed open panels
// and moved click targets. A route handler is a normal fetch outside the
// router, so it never refreshes the tree. Same readers, same session guard
// (requireTalentSelf inside each reader); read-only, allow-listed keys only.

import { NextResponse, type NextRequest } from "next/server";

import { loadWebsiteSettingsEnabledAction } from "@/components/talent/website-settings/website-settings-gate-action";
import { loadTalentInstagramCardAction } from "@/lib/talent-integrations/instagram-actions";
import { loadTalentSiteActivationStateAction } from "@/lib/talent-site/server/site-activation-state";
import { loadMySiteLiveVerifiedAction } from "@/lib/talent-site/server/site-live-verified";
import { isTalentDashboardReadKey, type TalentDashboardReadKey } from "@/lib/talent/dashboard-reads";

export const dynamic = "force-dynamic";

const READERS: { [K in TalentDashboardReadKey]: () => Promise<unknown> } = {
  "website-settings-enabled": loadWebsiteSettingsEnabledAction,
  "instagram-card": loadTalentInstagramCardAction,
  "site-activation": loadTalentSiteActivationStateAction,
  "site-live-verified": loadMySiteLiveVerifiedAction,
};

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("read");
  if (!isTalentDashboardReadKey(key)) {
    return NextResponse.json({ error: "unknown_read" }, { status: 404, headers: NO_STORE });
  }
  const value = await READERS[key]();
  return NextResponse.json({ value: value ?? null }, { headers: NO_STORE });
}
