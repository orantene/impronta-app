"use client";

// ════════════════════════════════════════════════════════════════════
// Website tab hover dropdown — two entry points into the Website surface:
// the site-management overview and the Card Design studio. The trigger is
// the normal "Website" nav button (still routes to the overview on click /
// tap); hovering reveals the menu. Menu is portalled to <body> because the
// nav scroller has `overflow: auto` and would otherwise clip it.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { Icon, type AdminShellIconName } from "../primitives";
import { COLORS, FONTS, Z } from "../state";
import { useWebsiteSubnav } from "./website-nav";

export function WebsiteNavItem({
  tenantSlug,
  children,
}: {
  tenantSlug: string | undefined;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useT();
  const websiteSubnav = useWebsiteSubnav();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const openMenu = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const el = wrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom, width: r.width });
    }
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 130);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const go = (item: { href: string; external?: boolean }) => {
    setOpen(false);
    if (item.external) {
      window.open(item.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(item.href);
    }
  };

  return (
    <span
      ref={wrapRef}
      data-tulala-website-nav-item
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onFocusCapture={openMenu}
      onBlurCapture={scheduleClose}
    >
      {children}
      {open && rect
        ? createPortal(
            <div
              role="menu"
              aria-label="Website sections"
              data-tulala-website-nav-menu
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
              style={{
                position: "fixed",
                left: rect.left,
                top: rect.top + 4,
                minWidth: Math.max(rect.width, 200),
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                boxShadow: COLORS.shadowHover,
                padding: 6,
                zIndex: Z.toast,
                fontFamily: FONTS.body,
              }}
            >
              {/* Single source of truth — website-nav.ts. Same order + gating
                  as the sidebar rail; this used to be a hand-maintained list
                  that had drifted out of sync (missing "Design", English-only). */}
              {websiteSubnav.map((item) => (
                <WebsiteMenuItem
                  key={item.id}
                  label={t(item.i18nKey)}
                  sub={t(item.descriptionI18nKey)}
                  iconName={item.icon}
                  onClick={() => go(item)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function WebsiteMenuItem({
  label,
  sub,
  iconName,
  onClick,
}: {
  label: string;
  sub: string;
  iconName: AdminShellIconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        border: "none",
        background: "transparent",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: FONTS.body,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = COLORS.surfaceAlt;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: COLORS.surfaceAlt,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: COLORS.inkMuted,
        }}
      >
        <Icon name={iconName} size={14} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: COLORS.inkDim }}>{sub}</span>
      </span>
    </button>
  );
}
