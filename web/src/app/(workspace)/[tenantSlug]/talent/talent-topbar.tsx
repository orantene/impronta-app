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
  { label: "Today",     path: "today"     },
  { label: "Inbox",     path: "inbox"     },
  { label: "Calendar",  path: "calendar"  },
  { label: "Profile",   path: "profile"   },
  { label: "Agencies",  path: "agencies"  },
  { label: "Settings",  path: "settings"  },
] as const;

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
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -14,
                    left: 8,
                    right: 8,
                    height: 3,
                    background: C.fill,
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              )}
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        {publicProfileUrl && (
          <a
            href={publicProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 500,
              color: C.inkMuted,
              textDecoration: "none",
              padding: "6px 4px",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            Preview profile
          </a>
        )}
      </div>
    </div>
  );
}
