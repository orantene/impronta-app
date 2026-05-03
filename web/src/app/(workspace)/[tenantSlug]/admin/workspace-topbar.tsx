"use client";

// WorkspaceTopbar — sticky horizontal tab nav matching the prototype's
// WorkspaceTopbar design. Uses usePathname() for active-tab detection
// and <Link> for URL-based navigation (real app, not proto setPage()).
//
// Imported by layout.tsx which is a Server Component; this component
// is the ONLY client-side slice of the workspace shell.

import { usePathname } from "next/navigation";
import Link from "next/link";

// ─── Design tokens (matching prototype _state.tsx COLORS/FONTS) ───────────────

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.72)",
  borderSoft: "rgba(24,24,27,0.06)",
  fill: "#0F4F3E",   // accent/brand — active underline
  surfaceAlt: "#F2F2EE",
  border: "rgba(24,24,27,0.10)",
} as const;

const FONT_BODY = '"Inter", system-ui, sans-serif';

// ─── Tab definitions ──────────────────────────────────────────────────────────
// segment: the URL segment after /admin/  (null = the /admin root itself)

const TABS = [
  { id: "overview",    label: "Overview",    segment: null         },
  { id: "messages",    label: "Messages",    segment: "messages"   },
  { id: "calendar",    label: "Calendar",    segment: "calendar"   },
  { id: "roster",      label: "Talent",      segment: "roster"     },
  { id: "clients",     label: "Clients",     segment: "clients"    },
  { id: "operations",  label: "Operations",  segment: "work"       },
  { id: "production",  label: "Production",  segment: "production" },
  { id: "settings",    label: "Settings",    segment: "settings"   },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceTopbar({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();

  // Detect active tab from URL.
  // pathname is like /impronta/admin  or  /impronta/admin/roster  etc.
  const adminBase = `/${tenantSlug}/admin`;
  const after = pathname.startsWith(adminBase)
    ? pathname.slice(adminBase.length)
    : "";
  // Strip leading slash; take first segment only
  const activeSegment = after.startsWith("/")
    ? after.slice(1).split("/")[0]
    : "";

  return (
    <header
      style={{
        background: "#fff",
        borderBottom: `1px solid ${C.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: 56,         // sits directly below the 56px identity bar
        zIndex: 40,
      }}
    >
      <nav
        aria-label="Workspace sections"
        style={{
          display: "flex",
          alignItems: "center",
          height: 52,
          gap: 2,
          overflowX: "auto",
          // Hide scrollbar on mobile while keeping scroll
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        {TABS.map((tab) => {
          const href = tab.segment
            ? `/${tenantSlug}/admin/${tab.segment}`
            : `/${tenantSlug}/admin`;

          const active =
            tab.segment === null
              ? activeSegment === ""
              : activeSegment === tab.segment;

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
                fontWeight: active ? 600 : 500,
                color: active ? C.ink : C.inkMuted,
                letterSpacing: 0.1,
                borderRadius: 7,
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                whiteSpace: "nowrap" as const,
                transition: "color 100ms",
              }}
            >
              {tab.label}

              {/* Active underline — matches prototype exactly */}
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
                  transition:
                    "opacity 200ms, transform 280ms cubic-bezier(.4,0,.2,1)",
                  pointerEvents: "none",
                }}
              />
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
