"use client";

// PlatformTopbar — sticky dark horizontal tab nav for the Tulala HQ console.
// Uses usePathname() for active-tab detection and <Link> for URL navigation.
// This is the only client slice of the platform admin shell.

import { usePathname } from "next/navigation";
import Link from "next/link";

// ─── HQ design tokens (dark surface) ─────────────────────────────────────────

const HQ = {
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

const FONT_BODY = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "today",      label: "Today",       segment: "today"      },
  { id: "tenants",    label: "Tenants",     segment: "tenants"    },
  { id: "users",      label: "Users",       segment: "users"      },
  { id: "network",    label: "Network",     segment: "network"    },
  { id: "billing",    label: "Billing",     segment: "billing"    },
  { id: "operations", label: "Operations",  segment: "operations" },
  { id: "settings",   label: "Settings",    segment: "settings"   },
] as const;

const BASE = "/platform/admin";

// ─── Component ────────────────────────────────────────────────────────────────

export function PlatformTopbar() {
  const pathname = usePathname();

  // Active segment: /platform/admin/tenants → "tenants"
  const after = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : "";
  const activeSegment = after.startsWith("/") ? after.slice(1).split("/")[0] : "";

  return (
    <header
      style={{
        background: HQ.card,
        borderBottom: `1px solid ${HQ.border}`,
        padding: "0 28px",
        position: "sticky",
        top: 56,
        zIndex: 40,
      }}
    >
      {/* Brand + nav row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 56,
          gap: 14,
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        {/* Tulala HQ identity chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 13,
              color: HQ.ink,
              letterSpacing: -0.2,
              flexShrink: 0,
            }}
          >
            T
          </span>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: HQ.ink,
            }}
          >
            Tulala HQ
          </span>
        </div>

        {/* Divider */}
        <span
          aria-hidden
          style={{
            width: 1,
            height: 20,
            background: HQ.borderSoft,
            flexShrink: 0,
          }}
        />

        {/* Page nav */}
        <nav
          aria-label="Platform sections"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flex: 1,
            overflowX: "auto",
            scrollbarWidth: "none",
          } as React.CSSProperties}
        >
          {TABS.map((tab) => {
            const href = `${BASE}/${tab.segment}`;
            const active = activeSegment === tab.segment;

            return (
              <Link
                key={tab.id}
                href={href}
                prefetch={false}
                style={{
                  background: "transparent",
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontFamily: FONT_BODY,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? HQ.ink : HQ.inkMuted,
                  letterSpacing: 0.1,
                  borderRadius: 7,
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "color 100ms",
                }}
              >
                {tab.label}

                {/* Active underline */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: HQ.ink,
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
        </nav>
      </div>
    </header>
  );
}
