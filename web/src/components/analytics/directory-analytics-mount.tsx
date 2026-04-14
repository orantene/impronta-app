"use client";

import { useEffect } from "react";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

export function DirectoryAnalyticsMount({
  locale,
  sourcePage = "/directory",
}: {
  locale: string;
  sourcePage?: string;
}) {
  useEffect(() => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_directory, {
      locale,
      source_page: sourcePage,
    });
  }, [locale, sourcePage]);

  return null;
}
