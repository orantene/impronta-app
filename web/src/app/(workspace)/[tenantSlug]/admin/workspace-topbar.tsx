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
  { id: "overview",    label: "Overview",    segment: null              },
  { id: "work",        label: "Work",        segment: "work"            },
  { id: "messages",    label: "Messages",    segment: "messages"        },
  { id: "calendar",    label: "Calendar",    segment: "calendar"        },
  { id: "roster",      label: "Talent",      segment: "roster"          },
  { id: "bookings",    label: "Bookings",    segment: "bookings"        },
  { id: "clients",     label: "Clients",     segment: "clients"         },
  { id: "operations",  label: "Operations",  segment: "operations"      },
  { id: "production",  label: "Production",  segment: "production"      },
  { id: "site",        label: "Website",     segment: "site"            },
  { id: "settings",    label: "Settings",    segment: "settings"        },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceTopbar({
  tenantSlug,
  isSuperAdmin = false,
  unreadMessages = 0,
  pendingRoster = 0,
}: {
  tenantSlug: string;
  /** M16: when true, renders a "Platform" link to /platform/admin. Only
   *  pass true when the authenticated user's app_role === 'super_admin'.
   */
  isSuperAdmin?: boolean;
  /** Total unread message count across all open inquiries. Shown as a red badge on Messages tab. */
  unreadMessages?: number;
  /** Pending roster approvals count. Shown as amber badge on Talent tab. */
  pendingRoster?: number;
}) {
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

          const badge =
            tab.id === "messages" && unreadMessages > 0
              ? unreadMessages > 99 ? "99+" : String(unreadMessages)
              : tab.id === "roster" && pendingRoster > 0
              ? String(pendingRoster)
              : null;
          const badgeAmber = tab.id === "roster" && pendingRoster > 0;

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
              {badge && (
                <span
                  aria-label={badgeAmber ? `${badge} pending` : `${badge} unread`}
                  style={{
                    minWidth: 18,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: badgeAmber ? "#B07D1A" : "#C0392B",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: "16px",
                    textAlign: "center",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {badge}
                </span>
              )}

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

        {/* M16: Platform HQ link — visible only when the actor is super_admin */}
        {/* ── Right-side spacer + search stubs ── */}
        <div style={{ flex: 1, minWidth: 16 }} />

        {/* Search ⌘K stub #1 — command palette trigger */}
        <button
          type="button"
          aria-label="Search"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 30,
            padding: "0 10px",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.inkMuted,
            fontFamily: FONT_BODY,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Search
          <span style={{ fontSize: 10, opacity: 0.55, letterSpacing: 0.2 }}>⌘K</span>
        </button>

        {/* Search ⌘K stub #2 — in-page filter */}
        <button
          type="button"
          aria-label="Filter"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 30,
            padding: "0 10px",
            borderRadius: 7,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.inkMuted,
            fontFamily: FONT_BODY,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
            marginLeft: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Search
          <span style={{ fontSize: 10, opacity: 0.55, letterSpacing: 0.2 }}>⌘K</span>
        </button>

        {isSuperAdmin && (
          <>
            {/* Soft divider before the platform link */}
            <span
              aria-hidden
              style={{
                width: 1,
                height: 16,
                background: C.borderSoft,
                margin: "0 6px",
                flexShrink: 0,
              }}
            />
            <Link
              href="/platform/admin"
              prefetch={false}
              style={{
                background: "transparent",
                cursor: "pointer",
                padding: "8px 12px",
                fontFamily: FONT_BODY,
                fontSize: 13,
                fontWeight: pathname.startsWith("/platform/admin") ? 600 : 500,
                color: pathname.startsWith("/platform/admin") ? C.ink : C.inkMuted,
                letterSpacing: 0.1,
                borderRadius: 7,
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                whiteSpace: "nowrap" as const,
                transition: "color 100ms",
                opacity: 0.75,
              }}
            >
              Platform
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
                  opacity: pathname.startsWith("/platform/admin") ? 1 : 0,
                  transform: pathname.startsWith("/platform/admin") ? "scaleX(1)" : "scaleX(0.4)",
                  transformOrigin: "center",
                  transition: "opacity 200ms, transform 280ms cubic-bezier(.4,0,.2,1)",
                  pointerEvents: "none",
                }}
              />
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
