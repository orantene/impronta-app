"use client";

import { useEffect, useRef } from "react";
import { startTalentUpgrade } from "@/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import { readPlanIntentFromUrl } from "@/lib/onboarding/plan-intent";

/**
 * Opens the tier-compare drawer once when /talent/plan mounts (TUL-666).
 * TUL-828: when the URL carries a valid paid intent (`?plan=&interval=` from
 * /pricing via /start), start that checkout instead; any failure falls back to
 * the drawer so the person is never left on a blank page.
 */
export function TalentPlanRouteOpener() {
  const shell = useAdminShellOptional();
  const openDrawer = shell?.openDrawer ?? null;
  const tenantSlug = shell?.tenantSlug ?? null;
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !openDrawer) return;
    ran.current = true;
    const intent = readPlanIntentFromUrl();
    if (!intent || !tenantSlug) {
      openDrawer("talent-tier-compare");
      return;
    }
    void startTalentUpgrade(intent.plan, tenantSlug, readPromoCodeFromUrl(), null, intent.interval)
      .then((result) => {
        if (result.ok && !result.planChange) window.location.assign(result.redirectUrl);
        else openDrawer("talent-tier-compare");
      })
      .catch(() => openDrawer("talent-tier-compare"));
  }, [openDrawer, tenantSlug]);
  return null;
}
