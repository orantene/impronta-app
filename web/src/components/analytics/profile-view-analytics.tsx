"use client";

import { useEffect } from "react";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

export function ProfileViewAnalytics({
  talentId,
  locale,
  sourcePage = "/t",
}: {
  talentId: string;
  locale: string;
  sourcePage?: string;
}) {
  useEffect(() => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_talent_profile, {
      talent_id: talentId,
      locale,
      source_page: sourcePage,
    });
  }, [talentId, locale, sourcePage]);

  return null;
}
