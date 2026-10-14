import "server-only";

import { headers } from "next/headers";

import { getAppUrl } from "@/lib/auth-flow";
import { siteReturnUrlFromRequest } from "@/lib/inquiry/claim-return-url";

/** Site URL of the current request (server action on a site host), or null. */
export async function readSiteReturnUrl(): Promise<string | null> {
  try {
    const h = await headers();
    return siteReturnUrlFromRequest({
      host: h.get("x-impronta-host-name") ?? h.get("host"),
      referer: h.get("referer"),
      appUrl: getAppUrl(),
    });
  } catch {
    return null;
  }
}
