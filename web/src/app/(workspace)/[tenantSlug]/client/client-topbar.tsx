"use client";

// Phase 3.10 — client nav topbar (client component for URL-based active state).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.06)",
  fill:       "#1D4ED8",
  pillBg:     "rgba(11,11,13,0.06)",
} as const;

const NAV_ITEMS = [
  { label: "Messages",   path: "messages"   },
  { label: "Today",      path: "today"      },
  { label: "Discover",   path: "discover"   },
  { label: "Favorites",  path: "favorites"  },
  { label: "Shortlists", path: "shortlists" },
  { label: "Inquiries",  path: "inquiries"  },
  { label: "Bookings",   path: "bookings"   },
  { label: "Settings",   path: "settings"   },
] as const;

export function ClientTopbar({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<{ favorites: number | null; shortlists: number | null }>({
    favorites: null,
    shortlists: null,
  });

  // Hydrate counts once on mount. Don't block render — pills appear when
  // the fetch lands. Failure stays null (no pill renders).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/discover/favorites").then((r) => (r.ok ? r.json() : { favorites: [] })),
      fetch("/api/discover/shortlists").then((r) => (r.ok ? r.json() : { shortlists: [] })),
    ])
      .then(([fav, sl]: [{ favorites?: unknown[] }, { shortlists?: unknown[] }]) => {
        if (cancelled) return;
        setCounts({
          favorites: Array.isArray(fav.favorites) ? fav.favorites.length : 0,
          shortlists: Array.isArray(sl.shortlists) ? sl.shortlists.length : 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const countFor = (path: string): number | null => {
    if (path === "favorites") return counts.favorites;
    if (path === "shortlists") return counts.shortlists;
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
