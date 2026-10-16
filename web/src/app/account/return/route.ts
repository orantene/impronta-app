import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl, getSiteUrl } from "@/lib/auth-flow";
import { safeClientReturnTo } from "@/lib/client-account/return-to";

/**
 * TUL-709: after the app-host client sign-in started from a workspace site,
 * send the client back to that site. `to` must pass the allow-listed
 * return-to check; anything else lands on the account page.
 */
export function GET(request: NextRequest) {
  const target = safeClientReturnTo(request.nextUrl.searchParams.get("to"), {
    siteUrl: getSiteUrl(),
    appUrl: getAppUrl(),
  });
  return NextResponse.redirect(target ?? new URL("/account", request.nextUrl.origin), 303);
}
