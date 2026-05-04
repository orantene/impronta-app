"use client";

// Phase 3.10 — client nav topbar (client component for URL-based active state).

import Link from "next/link";
import { usePathname } from "next/navigation";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.06)",
  fill:       "#1D4ED8",
} as const;

const NAV_ITEMS = [
  { label: "Today",      path: "today"      },
  { label: "Discover",   path: "discover"   },
  { label: "Inquiries",  path: "inquiries"  },
  { label: "Bookings",   path: "bookings"   },
  { label: "Shortlists", path: "shortlists" },
  { label: "Settings",   path: "settings"   },
] as const;

export function ClientTopbar({ tenantSlug }: { tenantSlug: string }) {
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
          const href = `/${tenantSlug}/client/${path}`;
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
      </div>
    </div>
  );
}
