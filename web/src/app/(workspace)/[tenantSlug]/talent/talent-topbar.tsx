"use client";

// Phase 3.3 — talent nav topbar (client component for URL-based active state).

import Link from "next/link";
import { usePathname } from "next/navigation";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.06)",
  fill:       "#0F4F3E",
} as const;

const NAV_ITEMS = [
  { label: "Today",       path: "today"     },
  { label: "Messages",    path: "inbox"     },
  { label: "Profile",     path: "profile"   },
  { label: "Calendar",    path: "calendar"  },
  { label: "Agencies",    path: "agencies"  },
  { label: "Settings",    path: "settings"  },
] as const;

// "Public page" is a link-out to the talent's live public profile,
// not a route within the app — rendered separately after the nav items.

export function TalentTopbar({
  tenantSlug,
  publicProfileUrl,
}: {
  tenantSlug: string;
  publicProfileUrl: string | null;
}) {
  const pathname = usePathname();

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: `1px solid ${C.borderSoft}`,
        position: "sticky",
        top: 56,
        zIndex: 40,
        padding: "0 24px",
        height: 52,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          maxWidth: 1440,
          margin: "0 auto",
          gap: 2,
        }}
      >
        {NAV_ITEMS.map(({ label, path }) => {
          const href = `/${tenantSlug}/talent/${path}`;
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={path}
              href={href}
              style={{
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? C.ink : C.inkMuted,
                letterSpacing: 0.1,
                textDecoration: "none",
                padding: "8px 12px",
                borderRadius: 7,
                position: "relative",
                transition: "color 120ms",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 8,
                  right: 8,
                  height: 2,
                  background: C.fill,
                  borderRadius: 2,
                  opacity: active ? 1 : 0,
                  transform: active ? "scaleX(1)" : "scaleX(0.4)",
                  transformOrigin: "center",
                  transition: "opacity 200ms, transform 280ms cubic-bezier(.4,0,.2,1)",
                  pointerEvents: "none",
                }}
              />
            </Link>
          );
        })}

        {/* Public page — styled as a nav tab, links out to the live public profile */}
        {publicProfileUrl && (
          <a
            href={publicProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 500,
              color: C.inkMuted,
              letterSpacing: 0.1,
              textDecoration: "none",
              padding: "8px 12px",
              borderRadius: 7,
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              transition: "color 120ms",
              whiteSpace: "nowrap",
            }}
          >
            Public page
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        )}

        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}
