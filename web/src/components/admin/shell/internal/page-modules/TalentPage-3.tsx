"use client";

import { useState, useTransition } from "react";
import { Avatar, ProfilePhotoBadgeOverlay, TrustBadgeGroup } from "../primitives";
import { COLORS, FONTS, TAXONOMY, useAdminShell } from "../state";
import type { TalentProfile } from "../state";
import { setRosterTalentSiteVisibility } from "@/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions";


// ── Directory-visibility eye toggle ─────────────────────────────────
// The agency's single public-visibility control for a roster talent.
// ON  → talent is listed in this agency's directory / search / page.
// OFF → talent stays on the roster but is not shown publicly.
// Replaces the old Draft/Published workflow chip + status pill.
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="m2 2 20 20" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

/**
 * Roster-card / row directory-visibility toggle. Optimistically flips the
 * agency eye and persists via `setRosterTalentSiteVisibility`. When the
 * talent has globally hidden themselves, the agency eye is overridden — a
 * non-interactive "Hidden by talent" marker is shown instead.
 */
export function RosterEyeToggle({
  talentId,
  tenantSlug,
  siteVisible,
  talentHidden,
}: {
  talentId: string;
  tenantSlug: string | undefined;
  siteVisible: boolean;
  talentHidden: boolean;
}) {
  const [visible, setVisible] = useState(siteVisible);
  const [pending, startTransition] = useTransition();

  if (talentHidden) {
    return (
      <div
        title="This talent has hidden their profile across all of Tulala. It will not appear publicly until they unhide it."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 999,
          background: COLORS.amberDeep,
          color: "#fff",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          whiteSpace: "nowrap",
          boxShadow: "0 1px 4px rgba(11,11,13,0.18)",
          backdropFilter: "blur(6px)",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Hidden by talent
      </div>
    );
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending || !tenantSlug) return;
    const next = !visible;
    setVisible(next); // optimistic
    startTransition(async () => {
      const res = await setRosterTalentSiteVisibility(tenantSlug, talentId, next);
      if (res && "error" in res && res.error) {
        setVisible(!next); // revert on failure
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !tenantSlug}
      aria-pressed={visible}
      aria-label={
        visible
          ? "Visible in your directory — click to hide"
          : "Hidden from your directory — click to show"
      }
      title={
        visible
          ? "Shown in your directory, search and on a public page. Click to hide."
          : "Not shown publicly — on your roster only. Click to show in your directory."
      }
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: `1px solid ${visible ? COLORS.accent : "rgba(11,11,13,0.14)"}`,
        background: visible ? COLORS.accent : "rgba(255,255,255,0.95)",
        color: visible ? "#fff" : COLORS.inkMuted,
        cursor: pending || !tenantSlug ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        boxShadow: "0 1px 4px rgba(11,11,13,0.16)",
        backdropFilter: "blur(6px)",
        opacity: pending ? 0.65 : 1,
        transition: "background .15s, border-color .15s, color .15s",
      }}
    >
      <EyeIcon open={visible} />
    </button>
  );
}


/** Resolves trust state for a talent and renders compact admin-surface badges. */
export function RosterTrustCell({ talentId }: { talentId: string }) {
  const { getTrustSummary, t } = useAdminShell();
  const trust = getTrustSummary("talent_profile", talentId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <TrustBadgeGroup trust={trust} surface="admin_roster" size="sm" max={4} />
      {trust.claimStatus === "disputed" && (
        <span title={t("admin.roster.card.disputedTitle")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(200,40,40,0.10)", color: "#C82828",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          }}>
          {t("admin.roster.card.disputed")}
        </span>
      )}
      {trust.claimStatus === "invite_sent" && (
        <span title={t("admin.roster.card.inviteSentTitle")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(82,96,109,0.10)", color: "#3A4651",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          }}>
          {t("admin.roster.card.inviteSent")}
        </span>
      )}
    </div>
  );
}

/** Modern verified-icon overlay on the talent's photo corner. */
export function RosterPhotoBadgeOverlay({ talentId }: { talentId: string }) {
  const { getTrustSummary } = useAdminShell();
  const trust = getTrustSummary("talent_profile", talentId);
  return <ProfilePhotoBadgeOverlay trust={trust} size="md" max={2} position="bottom-right" />;
}

// ── Roster list view ────────────────────────────────────────────────
export function RosterList({
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
  const { t, rosterCardBadges } = useAdminShell();
  return (
    <div
      data-tulala-roster-list
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: FONTS.body,
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-roster-list] [data-rl-header],
          [data-tulala-roster-list] [data-rl-completeness],
          [data-tulala-roster-list] [data-rl-lastactive] {
            display: none !important;
          }
        }
      `}</style>
      {/* Column header row */}
      <div
        data-rl-header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          background: "rgba(11,11,13,0.02)",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {onSelect && <span style={{ width: 18, flexShrink: 0 }} />}
        <span style={{ width: 36, flexShrink: 0 }} />
        <span className="flex-1 min-w-0">{t("admin.roster.row.colName")}</span>
        {rosterCardBadges.completeness && (
          <span data-rl-completeness style={{ width: 56, flexShrink: 0, textAlign: "right" }}>{t("admin.roster.row.colProfile")}</span>
        )}
        <span data-rl-lastactive style={{ width: 60, flexShrink: 0, textAlign: "right" }}>{t("admin.roster.row.colActive")}</span>
        {rosterCardBadges.visibility && (
          <span style={{ width: 84, flexShrink: 0 }}>{t("admin.roster.row.colState")}</span>
        )}
      </div>
      {items.map((p, i) => (
        <RosterRow
          key={p.id}
          profile={p}
          isFirst={i === 0}
          selected={selected.has(p.id)}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function RosterRow({
  profile,
  isFirst,
  selected,
  onSelect,
  onOpen,
}: {
  profile: TalentProfile;
  isFirst: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  const [hover, setHover] = useState(false);
  const { tenantSlug, t, rosterCardBadges } = useAdminShell();

  const typeMeta = (() => {
    if (!profile.primaryType) return null;
    for (const parent of TAXONOMY) {
      const c = parent.children.find((x) => x.id === profile.primaryType);
      if (c) return { label: c.label, emoji: parent.emoji, specialty: c.specialties?.[0] ?? null };
    }
    return null;
  })();
  const typeLabel = typeMeta?.label ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(profile)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(profile);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderTop: isFirst ? "none" : `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        background: hover ? "rgba(11,11,13,0.02)" : selected ? "rgba(15,79,62,0.04)" : "transparent",
        transition: "background 0.12s, opacity 0.15s",
        // Globally hidden by the talent → render the row "deactivated".
        opacity: profile.talentHidden ? 0.6 : 1,
      }}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(profile.id);
          }}
          aria-label={selected ? t("admin.roster.card.deselectAria") : t("admin.roster.card.selectAria")}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${selected ? COLORS.accent : COLORS.borderSoft}`,
            background: selected ? COLORS.accent : "transparent",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: hover || selected ? 1 : 0.5,
            transition: "opacity 0.12s",
          }}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {/* Avatar */}
      <span style={{ width: 36, height: 36, borderRadius: "50%", background: profile.thumb
            ? `url(${profile.thumb}) center/cover`
            : COLORS.surfaceAlt, flexShrink: 0, }}
      />

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
          {profile.name}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 1, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }} className="text-admin-ink-muted">
          {typeMeta && (
            <span aria-hidden style={{ fontSize: 12, flexShrink: 0, opacity: 0.85 }}>
              {typeMeta.emoji}
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {typeMeta?.label ?? profile.primaryType ?? t("admin.roster.row.noType")}
            {typeMeta?.specialty && <span className="text-admin-ink-dim">{" · "}{typeMeta.specialty}</span>}
            {profile.city && <span className="text-admin-ink-dim">{" · "}{profile.city}</span>}
          </span>
        </div>
      </div>

      {/* Completeness (non-published) */}
      {rosterCardBadges.completeness && profile.state !== "published" && profile.completeness !== undefined && (
        <div style={{ width: 56, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, textAlign: "right" }} className="text-admin-ink-muted">
            {profile.completeness}%
          </div>
          <div style={{ height: 3, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${profile.completeness}%`, height: "100%", background: COLORS.indigoDeep, }}
            />
          </div>
        </div>
      )}

      {/* Last active */}
      {profile.lastActive && (
        <div
          style={{
            fontSize: 11, width: 60, textAlign: "right", flexShrink: 0 }} className="text-admin-ink-muted">
          {profile.lastActive}
        </div>
      )}

      {/* Directory-visibility eye toggle */}
      {rosterCardBadges.visibility && (
        <RosterEyeToggle
          talentId={profile.id}
          tenantSlug={tenantSlug}
          siteVisible={profile.siteVisible ?? false}
          talentHidden={profile.talentHidden ?? false}
        />
      )}
    </div>
  );
}

// ── Roster empty state ──────────────────────────────────────────────
export function RosterEmptyState({
  searching,
  query,
  onClear,
  onAdd,
}: {
  searching: boolean;
  query?: string;
  onClear: () => void;
  onAdd?: () => void;
}) {
  const { t } = useAdminShell();
  return (
    <div
      style={{
        background: "#fff",
        border: `1px dashed ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "44px 24px",
        textAlign: "center",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>{searching ? "🔍" : "✨"}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 500, letterSpacing: -0.2, marginBottom: 4 }} className="text-admin-ink">
        {searching ? `${t("admin.roster.empty.noMatchesPrefix")} "${query}"` : t("admin.roster.empty.emptyTitle")}
      </div>
      <div style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }} className="text-admin-ink-muted">
        {searching
          ? t("admin.roster.empty.searchHint")
          : t("admin.roster.empty.emptyHint")}
      </div>
      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {searching && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("admin.roster.empty.clearFilters")}
          </button>
        )}
        {onAdd && !searching && (
          <>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                background: COLORS.fill,
                color: "#fff",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("admin.roster.empty.addFirst")}
            </button>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("admin.roster.empty.useTemplate")}
            </button>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1px dashed ${COLORS.border}`,
                background: "transparent",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("admin.roster.empty.bulkCsv")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk action bar (sticky bottom) ─────────────────────────────────
export function RosterBulkActionBar({
  count,
  onClear,
  onPublish,
  onArchive,
  isLoading = false,
  onSendPitch,
}: {
  count: number;
  onClear: () => void;
  onPublish: () => void;
  onArchive: () => void;
  isLoading?: boolean;
  onSendPitch?: () => void;
}) {
  const { t } = useAdminShell();
  const selectedWord = t("admin.roster.bulk.selectedSuffix");
  return (
    <div
      style={{
        position: "sticky",
        bottom: 16,
        left: 0,
        right: 0,
        marginTop: 16,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px 8px 16px",
          background: COLORS.ink,
          color: "#fff",
          borderRadius: 999,
          boxShadow: "0 12px 40px -8px rgba(11,11,13,0.35)",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        <span>{`${count} ${selectedWord}`}</span>
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)" }} />
        <button
          type="button"
          onClick={onPublish}
          disabled={isLoading}
          style={{ ...bulkBtnStyle, opacity: isLoading ? 0.5 : 1 }}
        >
          {isLoading ? "…" : t("admin.roster.bulk.publish")}
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={isLoading}
          style={{ ...bulkBtnStyle, opacity: isLoading ? 0.5 : 1 }}
        >
          {isLoading ? "…" : t("admin.roster.bulk.archive")}
        </button>

        <button
          type="button"
          onClick={onSendPitch}
          disabled={isLoading}
          style={{
            ...bulkBtnStyle,
            background: "#fff",
            color: COLORS.ink,
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {t("admin.roster.bulk.pitch")}
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={t("admin.roster.bulk.clearAria")}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.10)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const bulkBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
};
