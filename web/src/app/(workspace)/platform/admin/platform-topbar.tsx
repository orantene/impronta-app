"use client";

// PlatformTopbar — sticky dark horizontal tab nav for the Tulala HQ console.
// Uses usePathname() for active-tab detection and <Link> for URL navigation.
// This is the only client slice of the platform admin shell.

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { TulalaBrandLockup } from "@/components/brand/tulala-logo";

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
  { id: "today",      labelKey: "dashboard.platform.nav.today",        segment: "today"      },
  { id: "tenants",    labelKey: "dashboard.platform.nav.tenants",      segment: "tenants"    },
  { id: "users",      labelKey: "dashboard.platform.nav.users",        segment: "users"      },
  { id: "network",    labelKey: "dashboard.platform.nav.network",      segment: "network"    },
  { id: "commerce",   labelKey: "dashboard.platform.nav.commerce",     segment: "commerce"   },
  { id: "operations", labelKey: "dashboard.platform.nav.operations",   segment: "operations" },
  { id: "integrations", labelKey: "dashboard.platform.nav.integrations", segment: "integrations" },
  { id: "ai-providers", labelKey: "dashboard.platform.nav.aiProviders", segment: "ai-providers" },
  { id: "email",      labelKey: "dashboard.platform.nav.email",        segment: "email"      },
  { id: "catalog",    labelKey: "dashboard.platform.nav.catalog",      segment: "catalog" },
  { id: "taxonomy",   labelKey: "dashboard.platform.nav.taxonomy",     segment: "taxonomy"   },
  { id: "languages",  labelKey: "dashboard.platform.nav.languages",    segment: "languages"  },
  { id: "translations", labelKey: "dashboard.platform.nav.translations", segment: "translations" },
  { id: "builder-lab", labelKey: "dashboard.platform.nav.builderLab",  segment: "builder-lab" },
  { id: "support",    labelKey: "dashboard.platform.nav.support",      segment: "support"     },
  { id: "settings",   labelKey: "dashboard.platform.nav.settings",     segment: "settings"   },
  { id: "audit-log", labelKey: "dashboard.platform.nav.auditLog",      segment: "audit-log" },
] as const;

const BASE = "/platform/admin";

// ─── Component ────────────────────────────────────────────────────────────────

export function PlatformTopbar({ supportOpenCount = 0 }: { supportOpenCount?: number }) {
  const pathname = usePathname();
  const t = useT();
  const locale = useDashboardLocale();

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
        {/* Tulala HQ identity chip — same wordmark + tagline lockup as every
            other surface, plus a small "HQ" pill so platform staff can tell
            this console apart from the tenant-facing shell at a glance. */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          <TulalaBrandLockup
            wordmarkHeight={20}
            isSpanish={locale === "es"}
            color={HQ.ink}
            descriptorOpacity={0.55}
          />
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: HQ.inkMuted,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 5,
              padding: "3px 6px",
              flexShrink: 0,
            }}
          >
            HQ
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
          aria-label={t("dashboard.platform.nav.ariaLabel")}
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
                {t(tab.labelKey)}
                {tab.id === "support" && supportOpenCount > 0 ? (
                  <span
                    style={{
                      minWidth: 16,
                      height: 16,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: "#C26A45",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {supportOpenCount > 99 ? "99+" : supportOpenCount}
                  </span>
                ) : null}

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
