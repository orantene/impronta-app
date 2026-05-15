// Phase 2.2 — Canonical workspace Roster list.
//
// Replaces the 6-line PageRouteSyncer stub with a real server-rendered
// roster grid. The per-talent EDIT surface (/admin/roster/[id]) and
// the A8 commission sub-route (/admin/roster/[id]/commission) are
// already canonical; this extracts the LIST off the prototype SPA so
// the whole Roster surface is Next-routed.
//
// State + Discover + completeness filter chips (URL-param driven, no
// client island — same pattern as /admin/discover-inquiries). Each
// card deep-links to the existing canonical edit page.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  loadWorkspaceRosterEnriched,
  type WorkspaceRosterItem,
} from "../../_data-bridge/roster";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ state?: string; discover?: string; sort?: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(180,130,20,0.10)",
} as const;

const STATE_FILTERS = [
  { key: "all",       label: "All",       matches: () => true },
  { key: "published", label: "Published", matches: (t: WorkspaceRosterItem) => t.state === "published" },
  { key: "draft",     label: "Draft",     matches: (t: WorkspaceRosterItem) => t.state === "draft" },
  { key: "invited",   label: "Invited",   matches: (t: WorkspaceRosterItem) => t.state === "invited" },
  { key: "awaiting",  label: "Awaiting",  matches: (t: WorkspaceRosterItem) => t.state === "awaiting-approval" },
  { key: "claimed",   label: "Claimed",   matches: (t: WorkspaceRosterItem) => t.state === "claimed" },
] as const;

const DISCOVER_FILTERS = [
  { key: "all", label: "Any Discover", matches: () => true },
  { key: "on",  label: "On Discover",  matches: (t: WorkspaceRosterItem) => t.isDiscoverable === true },
  { key: "off", label: "Off Discover", matches: (t: WorkspaceRosterItem) => t.isDiscoverable !== true },
] as const;

type StateKey = (typeof STATE_FILTERS)[number]["key"];
type DiscoverKey = (typeof DISCOVER_FILTERS)[number]["key"];
type SortKey = "name" | "newest" | "completeness";

function chipHref(
  tenantSlug: string,
  state: StateKey,
  discover: DiscoverKey,
  sort: SortKey,
): string {
  const params = new URLSearchParams();
  if (state !== "all") params.set("state", state);
  if (discover !== "all") params.set("discover", discover);
  if (sort !== "name") params.set("sort", sort);
  const qs = params.toString();
  const base = `/${tenantSlug}/admin/roster`;
  return qs ? `${base}?${qs}` : base;
}

function FilterChip({
  href, label, count, active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <a
      href={href}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 30, padding: "0 12px", borderRadius: 999,
        textDecoration: "none", fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        color: active ? "#fff" : C.inkMuted,
        background: active ? C.ink : "rgba(11,11,13,0.04)",
        border: `1px solid ${active ? C.ink : C.borderSoft}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        color: active ? "rgba(255,255,255,0.65)" : C.inkDim,
        fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </span>
    </a>
  );
}

function stateTone(state: WorkspaceRosterItem["state"]): { bg: string; color: string; label: string } {
  switch (state) {
    case "published":         return { bg: C.successSoft, color: C.success, label: "Published" };
    case "claimed":           return { bg: C.accentSoft,  color: C.accent,  label: "Claimed" };
    case "invited":           return { bg: C.amberSoft,   color: C.amber,   label: "Invited" };
    case "awaiting-approval": return { bg: C.amberSoft,   color: C.amber,   label: "Awaiting" };
    default:                  return { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Draft" };
  }
}

export default async function AdminRosterPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const { state: rawState, discover: rawDiscover, sort: rawSort } = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);

  const all = await loadWorkspaceRosterEnriched(scope.tenantId);

  const activeState: StateKey =
    STATE_FILTERS.find((f) => f.key === rawState)?.key ?? "all";
  const activeDiscover: DiscoverKey =
    DISCOVER_FILTERS.find((f) => f.key === rawDiscover)?.key ?? "all";
  const activeSort: SortKey =
    rawSort === "newest" || rawSort === "completeness" ? rawSort : "name";

  const stateMatch = STATE_FILTERS.find((f) => f.key === activeState)!.matches;
  const discoverMatch = DISCOVER_FILTERS.find((f) => f.key === activeDiscover)!.matches;

  const filtered = all
    .filter((t) => stateMatch(t) && discoverMatch(t))
    .sort((a, b) => {
      if (activeSort === "newest") {
        return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
      }
      if (activeSort === "completeness") {
        return (a.completenessPercent ?? 0) - (b.completenessPercent ?? 0);
      }
      return a.name.localeCompare(b.name);
    });

  const sortHref = (s: SortKey) => chipHref(tenantSlug, activeState, activeDiscover, s);

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1280 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 16, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkMuted, marginBottom: 6,
          }}>
            Admin · Roster
          </div>
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600,
            color: C.ink, margin: 0, letterSpacing: -0.4,
          }}>
            Roster
            <span style={{
              marginLeft: 10, fontSize: 13, fontWeight: 600,
              padding: "3px 9px", borderRadius: 999,
              background: C.accentSoft, color: C.accent,
              verticalAlign: "middle",
            }}>
              {all.length}
            </span>
          </h1>
        </div>
        {canEdit && (
          <Link
            href={`/${tenantSlug}/admin/roster/new`}
            style={{
              display: "inline-flex", alignItems: "center",
              height: 38, padding: "0 16px", borderRadius: 9,
              background: C.accent, color: "#fff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            + Add talent
          </Link>
        )}
      </div>

      {all.length === 0 ? (
        <div style={{
          padding: 32, textAlign: "center",
          background: C.surface, border: `1px dashed ${C.borderSoft}`,
          borderRadius: 14, color: C.inkMuted, fontSize: 13,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No talent on the roster yet
          </div>
          <p style={{ fontSize: 12.5, margin: "0 auto", maxWidth: 380, lineHeight: 1.5 }}>
            {canEdit
              ? "Add your first talent to start building the workspace roster."
              : "The roster is empty. An admin can add talent."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATE_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  href={chipHref(tenantSlug, f.key, activeDiscover, activeSort)}
                  label={f.label}
                  count={all.filter((t) => f.matches(t) && discoverMatch(t)).length}
                  active={f.key === activeState}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {DISCOVER_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  href={chipHref(tenantSlug, activeState, f.key, activeSort)}
                  label={f.label}
                  count={all.filter((t) => f.matches(t) && stateMatch(t)).length}
                  active={f.key === activeDiscover}
                />
              ))}
              <span style={{ width: 1, height: 18, background: C.borderSoft, margin: "0 4px" }} />
              {(["name", "newest", "completeness"] as const).map((s) => (
                <a
                  key={s}
                  href={sortHref(s)}
                  style={{
                    display: "inline-flex", alignItems: "center",
                    height: 28, padding: "0 10px", borderRadius: 7,
                    fontSize: 11.5, textDecoration: "none",
                    fontWeight: activeSort === s ? 700 : 500,
                    color: activeSort === s ? C.ink : C.inkMuted,
                    background: activeSort === s ? "rgba(11,11,13,0.06)" : "transparent",
                  }}
                >
                  {s === "name" ? "A–Z" : s === "newest" ? "Newest" : "Needs work"}
                </a>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{
              padding: 28, textAlign: "center",
              background: C.surface, border: `1px dashed ${C.borderSoft}`,
              borderRadius: 14, color: C.inkMuted, fontSize: 13,
            }}>
              No talent matches this filter. Switch a chip above.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 14,
            }}>
              {filtered.map((t) => {
                const tone = stateTone(t.state);
                return (
                  <Link
                    key={t.id}
                    href={`/${tenantSlug}/admin/roster/${t.id}`}
                    style={{
                      display: "flex", flexDirection: "column",
                      background: C.cardBg, border: `1px solid ${C.border}`,
                      borderRadius: 14, overflow: "hidden",
                      textDecoration: "none", color: "inherit",
                    }}
                  >
                    <div style={{
                      aspectRatio: "4 / 5",
                      background: t.thumb
                        ? `url(${t.thumb}) center/cover no-repeat`
                        : C.accentSoft,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 30, fontWeight: 700, color: C.accent,
                      position: "relative",
                    }}>
                      {!t.thumb && t.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                      <span style={{
                        position: "absolute", top: 8, left: 8,
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                        textTransform: "uppercase", padding: "2px 7px",
                        borderRadius: 999, background: tone.bg, color: tone.color,
                      }}>
                        {tone.label}
                      </span>
                      {t.isDiscoverable && (
                        <span
                          title="On Tulala Discover"
                          style={{
                            position: "absolute", top: 8, right: 8,
                            fontSize: 10, fontWeight: 700,
                            padding: "2px 7px", borderRadius: 999,
                            background: "rgba(29,78,216,0.12)", color: "#1D4ED8",
                          }}
                        >
                          ◎ Discover
                        </span>
                      )}
                    </div>
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.inkMuted }}>
                        {[t.primaryTypeLabel, t.city].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {typeof t.completenessPercent === "number" && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{
                            height: 4, borderRadius: 2,
                            background: "rgba(11,11,13,0.06)", overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${Math.max(0, Math.min(100, t.completenessPercent))}%`,
                              height: "100%",
                              background: t.completenessPercent >= 80 ? C.success : t.completenessPercent >= 50 ? C.amber : C.inkDim,
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: C.inkDim, marginTop: 3 }}>
                            {t.completenessPercent}% complete
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      <p style={{
        marginTop: 24, fontSize: 11.5, color: C.inkDim, lineHeight: 1.5, maxWidth: 640,
      }}>
        Click a talent to edit their profile. Discover analytics + commission
        preview live on the per-talent edit page.
      </p>
    </div>
  );
}
