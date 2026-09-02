"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "../primitives";
import { COLORS, FONTS, useAdminShell } from "../state";
import type { TalentProfile } from "../state";
import { fillAdminTpl } from "./TalentPage-1";
import { RosterEyeToggle, RosterPhotoBadgeOverlay, RosterQuickViewButton, RosterTrustCell } from "./TalentPage-3";
import { resolveRosterCardTaxonomy } from "./roster-card-taxonomy";
import {
  RosterCardCategoryStrip,
  RosterCardTypeLines,
  buildRosterCardCategoryModel,
} from "./roster-card-category-block";
import type { RosterSortKey } from "./roster-sort";


export function FilterChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 11px",
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        background: active ? "rgba(15,79,62,0.08)" : "#fff",
        color: active ? COLORS.accentDeep : COLORS.ink,
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        whiteSpace: "nowrap",
      }}
    >
      {emoji && <span aria-hidden className="text-xs">{emoji}</span>}
      {label}
    </button>
  );
}

export function SortButton({
  sort,
  sortDir,
  onSort,
}: {
  sort: RosterSortKey;
  sortDir: "asc" | "desc";
  onSort: (s: RosterSortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useAdminShell();
  const sortLabel = {
    recommended: t("admin.roster.filters.sortRecommended"),
    name: t("admin.roster.filters.sortName"),
    completeness: t("admin.roster.filters.sortCompleteness"),
    newest: t("admin.roster.filters.sortNewest"),
    lastEdited: t("admin.roster.filters.sortLastEdited"),
  }[sort];
  const arrow = sortDir === "asc" ? " ↑" : " ↓";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "5px 11px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          color: COLORS.ink,
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {t("admin.roster.filters.sortLabel")} <strong>{sortLabel}{arrow}</strong>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 51,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: "0 10px 30px -8px rgba(11,11,13,0.18)",
              minWidth: 160,
              padding: 4,
              fontFamily: FONTS.body,
            }}
          >
            {(["recommended", "name", "completeness", "newest", "lastEdited"] as const).map((s) => {
              const labels: Record<string, string> = {
                recommended: t("admin.roster.filters.sortRecommended"),
                name: t("admin.roster.filters.sortName"),
                completeness: t("admin.roster.filters.sortCompleteness"),
                newest: t("admin.roster.filters.sortNewest"),
                lastEdited: t("admin.roster.filters.sortLastEdited"),
              };
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onSort(s); setOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 6, border: "none",
                    background: s === sort ? "rgba(11,11,13,0.04)" : "transparent",
                    cursor: "pointer", textAlign: "left", fontSize: 12.5,
                    fontWeight: 500, color: COLORS.ink,
                  }}
                >
                  {labels[s]}
                  {s === sort && <span style={{ marginLeft: "auto", fontSize: 11 }} className="text-admin-ink-muted">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function ViewToggle({ view, onView }: { view: "grid" | "list"; onView: (v: "grid" | "list") => void }) {
  const { t } = useAdminShell();
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        background: "rgba(11,11,13,0.04)",
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {(["grid", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          aria-label={v === "grid" ? t("admin.roster.filters.viewGridAria") : t("admin.roster.filters.viewListAria")}
          aria-pressed={view === v}
          style={{
            width: 28,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: view === v ? "#fff" : "transparent",
            color: view === v ? COLORS.ink : COLORS.inkMuted,
            cursor: "pointer",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: view === v ? "0 1px 2px rgba(11,11,13,0.08)" : "none",
          }}
        >
          {v === "grid" ? (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Roster more menu (... button for Export / Import / Manage types) ─
export function RosterMoreMenu({
  open,
  onToggle,
  onClose,
  onExport,
  onImport,
  onTypes,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onTypes: () => void;
}) {
  const { t } = useAdminShell();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={t("admin.roster.list.moreActionsAria")}
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          color: COLORS.ink,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          fontWeight: 600,
        }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 51,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: "0 12px 36px -8px rgba(11,11,13,0.20)",
              minWidth: 200,
              padding: 4,
              fontFamily: FONTS.body,
            }}
          >
            {[
              { id: "export", label: t("admin.roster.list.exportCsv"),    onClick: onExport },
              { id: "import", label: t("admin.roster.list.importCsv"),    onClick: onImport },
              { id: "types",  label: t("admin.roster.list.talentTypes"), onClick: onTypes },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: COLORS.ink,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Roster grid ─────────────────────────────────────────────────────
export function RosterGrid({
  items,
  selected,
  onSelect,
  onOpen,
}: {
  items: TalentProfile[];
  selected: Set<string>;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  return (
    <div
      data-tulala-roster-grid
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      <style>{`
        @media (max-width: 600px) {
          [data-tulala-roster-grid] { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (min-width: 1500px) {
          /* Cap card density on wide screens — 7+ cards per row gets claustrophobic. */
          [data-tulala-roster-grid] {
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            max-width: 1340px;
          }
        }
      `}</style>
      {items.map((p) => (
        <RosterCard
          key={p.id}
          profile={p}
          selected={selected.has(p.id)}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ── Roster card (premium 2026 design) ───────────────────────────────
/**
 * Shared base style for the roster-card overlay pills. One cohesive token —
 * dark frosted glass, hairline light border, blur — so the completeness,
 * photo-count, TAL-ID and availability chips read as one family instead of
 * the four slightly-different pills they used to be. Per-pill overrides
 * (critical red at 0 photos, mono for the TAL-ID, the light availability
 * variant) spread on top of this.
 */
const OVERLAY_PILL_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 22,
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(11,11,13,0.62)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

function RosterCard({
  profile,
  selected,
  onSelect,
  onOpen,
}: {
  profile: TalentProfile;
  selected: boolean;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  const [hover, setHover] = useState(false);
  // Mirror the old CSS background-image silent-fallback: on 400/404 from
  // Supabase, hide the image and let the initials placeholder show through.
  const [photoFailed, setPhotoFailed] = useState(false);
  const { bridgeTalentSelfProfile, tenantSlug, t, locale, rosterCardBadges } = useAdminShell();
  const isSelf = !!bridgeTalentSelfProfile?.id && profile.id === bridgeTalentSelfProfile.id;

  // Resolve categories → parent label (WHO bucket), primary label ("what they
  // do", humanized — never a raw slug), secondary labels ("what else").
  // Live bridge chips win; static TAXONOMY covers mock workspaces.
  const taxonomyView = resolveRosterCardTaxonomy(profile, locale);
  // Category-block layout. `expanded` is the historical card. The two
  // parent-anchored modes collapse the tree to ONE label — the parent talent
  // type — and (in `parent_first`) hang the child types behind a `+`.
  const categoryModel = buildRosterCardCategoryModel(
    taxonomyView,
    rosterCardBadges.categories,
    rosterCardBadges.typeDisplay,
  );

  // Availability dot
  const availDot = profile.availability === "available"
    ? COLORS.green
    : profile.availability === "busy"
      ? COLORS.amber
      : "rgba(11,11,13,0.18)";

  return (
    <div
      onClick={() => onOpen(profile)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(profile);
        }
      }}
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${isSelf ? COLORS.accent : selected ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 14,
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s",
        boxShadow: hover ? "0 6px 20px -10px rgba(11,11,13,0.18)" : "0 1px 2px rgba(11,11,13,0.03)",
        // Talent has globally hidden themselves — render the card "deactivated"
        // so the agency sees at a glance it is off everywhere, not just here.
        opacity: profile.state === "draft" ? 0.75 : profile.talentHidden ? 0.6 : 1,
      }}
    >
      {/* Photo */}
      <div style={{ position: "relative", aspectRatio: "4 / 5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }} className="bg-admin-surface-alt">
        {profile.thumb && !photoFailed && (
          <Image
            src={profile.thumb}
            alt={profile.name}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 1500px) 22vw, 220px"
            style={{ objectFit: "cover" }}
            unoptimized={!/^https?:\/\//.test(profile.thumb) || profile.thumb.includes("pravatar.cc") || /\/(card|thumb|polaroid)\//.test(profile.thumb)}
            onError={() => setPhotoFailed(true)}
          />
        )}
        {/* Initials fallback — shown when no photo OR photo URL failed to load.
            Mirrors the pre-migration CSS background-image silent-fallback. */}
        {(!profile.thumb || photoFailed) && (
          <div
            aria-hidden
            style={{
              fontFamily: FONTS.display,
              fontSize: 36,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: -1,
              userSelect: "none",
            }}
          >
            {profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        )}
        {/* Verified marks now live in the bottom-right stack (below) so they
            stack with availability + TAL-ID instead of overlapping them. */}
        {/* "You" badge — persistent marker when this is the signed-in talent's own profile */}
        {isSelf && (
          <div
            aria-label={t("admin.roster.card.youBadgeAria")}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: 999,
              background: COLORS.accent,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.3,
              backdropFilter: "blur(6px)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              pointerEvents: "none",
            }}
          >
            {t("admin.roster.card.youBadge")}
          </div>
        )}

        {/* Selection checkbox — appears on hover or if selected */}
        {onSelect && (hover || selected) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(profile.id);
            }}
            aria-label={selected ? t("admin.roster.card.deselectAria") : t("admin.roster.card.selectAria")}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 22,
              height: 22,
              borderRadius: 6,
              border: `1.5px solid ${selected ? COLORS.accent : "rgba(255,255,255,0.9)"}`,
              background: selected ? COLORS.accent : "rgba(11,11,13,0.4)",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(6px)",
            }}
          >
            {selected && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}

        {/* Top-right stack — directory-visibility eye toggle + Discover pill.
            The eye is the agency's single public-visibility control; it
            replaced the old Draft/Published status chip. */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 5,
            zIndex: 2,
          }}
        >
          {rosterCardBadges.visibility && (
            <RosterEyeToggle
              talentId={profile.id}
              tenantSlug={tenantSlug}
              siteVisible={profile.siteVisible ?? false}
              talentHidden={profile.talentHidden ?? false}
            />
          )}
          {/* Quick view — soft-navigates to /t/<code>; the root @modal/(.)t
              interception renders the public profile as a popup OVER the
              roster, so staff can peek a talent without losing their place. */}
          {rosterCardBadges.quickView && profile.profileCode && (
            <RosterQuickViewButton profileCode={profile.profileCode} />
          )}
          {/* "On Discover" pill — surfaces talent_profiles.is_discoverable
              (the talent's cross-tenant Tulala Discover opt-in). */}
          {rosterCardBadges.discover && profile.isDiscoverable && (
            <div
              aria-label="On Tulala Discover"
              title="This talent has enabled their Discover toggle"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(46,125,91,0.92)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                backdropFilter: "blur(6px)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                pointerEvents: "none",
              }}
            >
              Discover
            </div>
          )}
        </div>

        {/* Bottom-left stack: completeness (non-published only) + portfolio count */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {rosterCardBadges.completeness && profile.state !== "published" && profile.completeness !== undefined && (
            <div
              style={OVERLAY_PILL_BASE}
              /* The percentage says how far along; the tooltip says what to do
                 about it. An admin managing a roster of 50 needs the second
                 one — "62%" is not an instruction. Blockers are the unmet
                 labels from the same gate the Publish button enforces. */
              title={
                profile.publishBlockers && profile.publishBlockers.length > 0
                  ? fillAdminTpl(t("admin.roster.card.publishNeeds"), {
                      items: profile.publishBlockers.join(", "),
                    })
                  : t("admin.roster.card.publishReady")
              }
            >
              {profile.completeness}%
            </div>
          )}
          {rosterCardBadges.photoCount && profile.portfolioCount !== undefined && (
            <div
              title={
                profile.portfolioCount === 1
                  ? fillAdminTpl(t("admin.roster.card.portfolioPhotoSingular"), {
                      count: String(profile.portfolioCount),
                    })
                  : fillAdminTpl(t("admin.roster.card.portfolioPhotoPlural"), {
                      count: String(profile.portfolioCount),
                    })
              }
              style={{
                ...OVERLAY_PILL_BASE,
                ...(profile.portfolioCount === 0
                  ? {
                      // Cooler, palette-aligned critical red (≈ COLORS.critical
                      // #B0303A) instead of the old orange-leaning rgba.
                      background: "rgba(176,48,58,0.84)",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }
                  : null),
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <circle cx="12" cy="13" r="3.2" />
                <path d="M8 6l1.5-2h5L16 6" />
              </svg>
              {profile.portfolioCount}
            </div>
          )}
        </div>

        {/* Bottom-right stack: verified marks + availability pill (published
            only) + the talent's canonical code (TAL-NNNNN). Stacked vertically
            so the verified mark, availability, and ID never overlap. */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            zIndex: 2,
          }}
        >
          {rosterCardBadges.trust && <RosterPhotoBadgeOverlay talentId={profile.id} inline />}
          {rosterCardBadges.availability && profile.state === "published" && profile.availability && (
            <div
              style={{
                ...OVERLAY_PILL_BASE,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(11,11,13,0.06)",
                color: COLORS.ink,
                textTransform: "capitalize",
                boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: availDot }} />
              {profile.availability}
            </div>
          )}
          {rosterCardBadges.talentId && profile.profileCode && (
            <div
              title={profile.profileCode}
              style={{
                ...OVERLAY_PILL_BASE,
                fontWeight: 700,
                letterSpacing: 0.3,
                fontFamily: FONTS.mono,
              }}
            >
              {profile.profileCode}
            </div>
          )}
        </div>
      </div>

      {/* Category strip between photo and body — `expanded` mode only; the
          parent-anchored modes list their parents as body rows instead. */}
      <RosterCardCategoryStrip
        model={categoryModel}
        categoriesOn={rosterCardBadges.categories}
      />

      {/* Card body — name + type + city, hairlined */}
      <div style={{ padding: "10px 12px 12px" }}>
        {profile.state === "draft" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 7px", borderRadius: 5, marginBottom: 5,
            background: "rgba(11,11,13,0.06)",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
            textTransform: "uppercase",
          }} className="text-admin-ink-muted">
            Draft
          </div>
        )}
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
          {profile.name}
        </div>
        <RosterCardTypeLines
          model={categoryModel}
          categoriesOn={rosterCardBadges.categories}
          noTypeLabel={t("admin.roster.card.noTypeSet")}
          unsupportedTooltip={t("admin.roster.card.typeNotOfferedTooltip")}
          getToggleAria={(parentLabel) =>
            fillAdminTpl(t("admin.roster.card.toggleTypesAria"), {
              category: parentLabel,
            })
          }
        />
        {profile.city && (
          <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
            📍 {profile.city}
            {profile.lastActive && profile.lastActive !== "—"
              ? fillAdminTpl(t("admin.roster.card.activeLine"), { when: profile.lastActive })
              : null}
          </div>
        )}
        {/* Trust & claim indicators — visible on every Roster card. */}
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          <RosterTrustCell talentId={profile.id} />
        </div>
        {profile.state === "draft" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(profile);
            }}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px dashed ${COLORS.accent}`,
              background: "transparent",
              color: COLORS.accentDeep,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.1,
            }}
          >
            Continue editing →
          </button>
        )}
      </div>
    </div>
  );
}
