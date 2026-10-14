import "server-only";

import { anyDemoTalent } from "@/lib/talent/demo-talent";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveClientAccountMount } from "@/lib/client-account/gate";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

/** Demo talent (fictional theme example): true when this profile is a demo. */
export async function loadMaxSiteIsDemo(talentProfileId: string): Promise<boolean> {
  const demoDb = createServiceRoleClient();
  return demoDb ? await anyDemoTalent(demoDb, [talentProfileId]) : false;
}

/** The booking switch the slots API gates on; fails open like the switches loader. */
export async function loadMaxSiteAcceptingBookings(talentProfileId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  return admin ? (await loadTalentSiteSwitches(admin, talentProfileId)).acceptingBookings : true;
}

/**
 * The header carries the site chrome: the talent site's ES / EN switch (the
 * demo marker is `MaxSiteDemoBadge`, never header chrome). Site header only.
 */
export function withHeaderSiteChrome(
  sectionProps: unknown,
  sectionTypeKey: unknown,
  isDemo: boolean,
  /** The TALENT's languages, primary first. One language: no switch. */
  locales: readonly string[] = [],
  /** Each code -> this page in that language (talent URL grammar). */
  hrefs?: Readonly<Record<string, string>>,
  /** Paid Web Office only (TUL-240): the icons the header's `social` item shows. */
  social: readonly { platform: string; href: string; label: string }[] = [],
  /** TUL-694: the site's own client account switch (default on; the host flag still gates). */
  accountEntry = true,
): unknown {
  if (sectionTypeKey !== "site_header" || !sectionProps || typeof sectionProps !== "object") return sectionProps;
  const list = locales.length > 1 ? locales.slice(0, 4) : [];
  return {
    ...(sectionProps as Record<string, unknown>),
    siteChrome: { demo: isDemo, ...(accountEntry && resolveClientAccountMount("talent").headerItem ? { account: true } : {}), locales: list, ...(list.length > 1 && hrefs ? { hrefs } : {}), ...(social.length ? { social: [...social] } : {}) },
  };
}
