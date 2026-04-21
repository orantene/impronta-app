"use client";

import { useEffect, useRef } from "react";
import { trackProductEvent } from "@/lib/analytics/track-client";

/**
 * Section-viewed tracker. Looks at children with `data-mkt-section`
 * attributes and fires a `marketing_section_viewed` event the first
 * time each one crosses a 45% intersection threshold. Respects
 * prefers-reduced-motion users and only runs in the browser.
 */
export function MarketingAnalyticsTracker({
  sourcePage,
  children,
}: {
  sourcePage: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = rootRef.current;
    if (!root) return;

    const sections = root.querySelectorAll<HTMLElement>("[data-mkt-section]");
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const name = entry.target.getAttribute("data-mkt-section");
          if (!name || seenRef.current.has(name)) continue;
          seenRef.current.add(name);
          trackProductEvent("marketing_section_viewed", {
            source_page: sourcePage,
            section: name,
          });
        }
      },
      { threshold: 0.45 },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [sourcePage]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
