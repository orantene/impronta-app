"use client";

import { useEffect, useRef } from "react";
import { startWorkspaceUpgrade } from "./stripe-billing-actions";
import { readPromoCodeFromUrl } from "@/lib/billing/promo-code-param";
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";

/**
 * TUL-828: starts the workspace checkout the visitor picked on /pricing, once.
 * The server page only renders this for a purchasable plan on a workspace with
 * no live subscription. Any failure (or a plan-change redirect) leaves the
 * normal billing page in place.
 */
export function WorkspaceCheckoutAutoStart({
  plan,
  interval,
  tenantSlug,
}: {
  plan: WorkspacePlanKey;
  interval: "month" | "year";
  tenantSlug: string;
}) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void startWorkspaceUpgrade(plan, tenantSlug, readPromoCodeFromUrl(), null, interval)
      .then((result) => {
        if (result.ok && !result.planChange) window.location.assign(result.redirectUrl);
      })
      .catch(() => undefined);
  }, [plan, interval, tenantSlug]);
  return null;
}
