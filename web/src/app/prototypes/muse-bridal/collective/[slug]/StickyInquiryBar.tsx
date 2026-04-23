"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sticky bottom inquiry bar that reveals after the hero scrolls past.
 *
 * Future systemization (Template → Profile Layout Option):
 *   - `sticky_inquiry_bar`: bool toggle on profile templates.
 *   - `sticky_bar_variant`: compact (mobile) | full (desktop).
 */
export function StickyInquiryBar({
  name,
  role,
  startingFrom,
}: {
  name: string;
  role: string;
  startingFrom: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        transform: visible ? "translateY(0)" : "translateY(120%)",
        transition: "transform 520ms var(--muse-ease-soft)",
        padding: "14px 16px calc(14px + env(safe-area-inset-bottom))",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        style={{
          margin: "0 auto",
          maxWidth: 980,
          background: "var(--muse-ivory)",
          border: "1px solid var(--muse-line)",
          borderRadius: "var(--muse-radius-pill)",
          boxShadow: "0 26px 60px -26px rgba(74,64,58,0.32)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 10px 10px 24px",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--muse-font-display)",
              fontSize: 18,
              color: "var(--muse-espresso-deep)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muse-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {role} · {startingFrom}
          </span>
        </div>
        <Link
          href={`/prototypes/muse-bridal/contact?pro=${encodeURIComponent(name)}`}
          className="muse-btn muse-btn--primary muse-btn--sm"
        >
          Inquire
        </Link>
      </div>
    </div>
  );
}
