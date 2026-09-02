"use client";

// Phase 3.10 — client nav topbar (client component for URL-based active state).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createTranslator } from "@/i18n/messages";

import { useFavorites } from "@/lib/talent-cards/use-favorites";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.06)",
  fill:       "#1D4ED8",
  pillBg:     "rgba(11,11,13,0.06)",
} as const;

// `fallbackLabel` is used only when the i18n catalog has no
// `dashboard.clientNav.<key>` string yet (the translator returns the raw key
// path in that case). Existing items resolve from the catalog and omit it.
// Order mirrors the dashboard rail so the client nav reads the same
// left-to-right everywhere: Today first, then the inbox spine
// (messages -> inquiries -> bookings), then discovery
// (discover/favorites/shortlists/pitches), reviews, and settings.
const NAV_ITEMS = [
  { key: "today",      path: "today"      },
  { key: "messages",   path: "messages"   },
  { key: "inquiries",  path: "inquiries"  },
  { key: "bookings",   path: "bookings"   },
  { key: "discover",   path: "discover"   },
  { key: "favorites",  path: "favorites"  },
  { key: "shortlists", path: "shortlists" },
  { key: "pitches",    path: "pitches"    },
  { key: "reviews",    path: "reviews",    fallbackLabel: "Reviews" },
  { key: "settings",   path: "settings"   },
] as const;

export function ClientTopbar({
  tenantSlug,
  locale = "en",
  reviewsEnabled = true,
}: {
  tenantSlug: string;
  locale?: string;
  /**
   * Reviews are a PREMIUM capability gated on the surface tenant's entitlement.
   * When false, the "reviews" nav entry is hidden. Threaded from the client
   * layout (a server component) which resolves the entitlement. Defaults to
   * true so callers that predate the gate keep the item.
   */
  reviewsEnabled?: boolean;
}) {
  const pathname = usePathname();
  const t = createTranslator(locale);
  // D4 — favorites count comes from the canonical useFavorites() store
  // (seeded SSR by DiscoveryStateBridge), so the pill updates live the
  // moment a talent is favorited/unfavorited anywhere in the dashboard.
  const favorites = useFavorites();
  const [counts, setCounts] = useState<{
    shortlists: number | null;
    pitches: number | null;
  }>({
    shortlists: null,
    pitches: null,
  });

  // Hydrate shortlist + pitch counts once on mount. Don't block render —
  // pills appear when the fetch lands. Failure stays null (no pill renders).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/discover/shortlists").then((r) => (r.ok ? r.json() : { shortlists: [] })),
      fetch("/api/client/pitches/count").then((r) => (r.ok ? r.json() : { count: 0 })),
    ])
      .then(
        ([sl, pi]: [
          { shortlists?: unknown[] },
          { count?: number },
        ]) => {
          if (cancelled) return;
          setCounts({
            shortlists: Array.isArray(sl.shortlists) ? sl.shortlists.length : 0,
            pitches: typeof pi.count === "number" ? pi.count : 0,
          });
        },
      )
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const countFor = (path: string): number | null => {
    if (path === "favorites") return favorites.isReady ? favorites.favoritesCount : null;
    if (path === "shortlists") return counts.shortlists;
    if (path === "pitches") return counts.pitches;
    return null;
  };

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: `1px solid ${C.borderSoft}`,
        position: "sticky",
        top: 56,
        zIndex: 40,
        height: 52,
        // D.3 — horizontal scroll on narrow widths instead of overflow
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
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
          padding: "0 24px",
          // D.3 — flex children stay on one line; container scrolls if needed
          width: "max-content",
          minWidth: "100%",
        }}
      >
        {NAV_ITEMS.filter(
          (item) => reviewsEnabled || item.key !== "reviews",
        ).map((item) => {
          const { key, path } = item;
          const href = `/${tenantSlug}/client/${path}`;
          const active = pathname === href || pathname.startsWith(href + "/");
          const messageKey = `dashboard.clientNav.${key}`;
          const translated = t(messageKey);
          // The translator returns the raw key path when no catalog string
          // exists; fall back to the item's explicit label in that case.
          const label =
            translated === messageKey && "fallbackLabel" in item
              ? item.fallbackLabel
              : translated;
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
              <span className="inline-flex items-center gap-1.5">
                {label}
                {(() => {
                  const n = countFor(path);
                  if (n === null || n === 0) return null;
                  return (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 18, height: 18, padding: "0 5px",
                        borderRadius: 999,
                        background: active ? C.fill : C.pillBg,
                        color: active ? "#fff" : C.inkDim,
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
                      }}
                    >
                      {n}
                    </span>
                  );
                })()}
              </span>
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
      </div>
    </div>
  );
}
