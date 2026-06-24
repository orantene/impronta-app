"use client";

/**
 * Card Design studio — the admin surface for controlling how talent cards
 * render across the four places they appear. It DRIVES the existing engine,
 * it does not fork it:
 *
 *   - Card fields come from `field_definitions` via
 *     `readCardDesignFieldCandidates`; toggling one calls `setFieldCardVisible`
 *     (tenant-local override). That is the same `card_visible` flag the
 *     directory card display catalog reads, so a change here propagates to
 *     every rendered card. This persistence is REAL and immediate.
 *
 *   - Per-surface appearance (style / aspect / show-toggles) mirrors the
 *     `directorySchemaV1` vocabulary. In this release it is an interactive
 *     PREVIEW only — a workspace-level appearance store needs a migration and
 *     is deferred. The honesty banner says so; we never imply a silent save.
 *
 *   - Favorite + inquiry affordances follow per-surface rules (the user's
 *     explicit decision): Roster = neither (internal grid), Pitch = inquiry
 *     only (the favorite is redundant once a shortlist is sent), Directory +
 *     Embedded = both (public buyer surfaces). The preview faithfully
 *     replicates `<TalentCardActions>` so what an admin sees here is what a
 *     client gets. The favorite glyph honours the tenant `favoriteIcon` token.
 *
 * Presentational parts + the surface/appearance vocabulary live in
 * `CardDesignStudio-2.tsx`; this file owns state + engine wiring.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type CardDesignFieldCandidate,
  readCardDesignFieldCandidates,
  setFieldCardVisible,
} from "@/lib/site-admin/server/directory-catalogs";
import { useFavoriteIcon } from "@/lib/talent-cards/use-favorite-icon";
import {
  ROSTER_CARD_BADGE_META,
  type RosterCardBadgeKey,
} from "@/lib/talent-cards/roster-card-badges";
import { listCardKits } from "@/lib/site-admin/presets/card-kits";
import {
  applyCardKitFromEditAction,
  loadDesignAction,
  publishDesignFromEditAction,
  saveDesignDraftFromEditAction,
} from "@/lib/site-admin/edit-mode/design-actions";
import { EmptyState, Icon, SecondaryButton, Toggle } from "../primitives";
import { COLORS, FONTS, RADIUS, SPACE, meetsRole, useAdminShell } from "../state";
import {
  type CardAppearance,
  type CardAspect,
  type CardKitOption,
  type CardStyle,
  type CardSurface,
  type DesignPublishState,
  type DesignSaveState,
  type FieldSaveState,
  type HoverBehavior,
  CARD_DESIGN_TOKEN_KEYS,
  CARD_FAMILY_TOKEN_KEY,
  CardDesignPreviewColumn,
  CardSurfaceTabStrip,
  DEFAULT_APPEARANCE,
  DesignLookSection,
  GroupHeader,
  HOVER_LABEL,
  PublishCluster,
  Segmented,
  SURFACE_RULES,
  ToggleRow,
} from "./CardDesignStudio-2";

// ────────────────────────────────────────────────────────────────────────
// Main studio
// ────────────────────────────────────────────────────────────────────────

export function CardDesignStudio() {
  const { state, toast, rosterCardBadges, setRosterCardBadge } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  // Publishing the card design to every live surface is an owner/admin move;
  // the action layer re-checks `agency.site_admin.design.publish` server-side.
  const canPublish = meetsRole(state.role, "admin");
  const tenantFavoriteIcon = useFavoriteIcon();

  const [activeSurface, setActiveSurface] = useState<CardSurface>("directory");
  const [appearance, setAppearance] = useState<CardAppearance>(DEFAULT_APPEARANCE);
  const [favoriteIcon, setFavoriteIcon] = useState<"heart" | "bookmark">("heart");

  // ── Visual design (REAL persistence — card-family design tokens) ──────────
  // The kit chooser + color knobs + Publish drive the agency design draft via
  // the edit-mode design actions, then one Publish promotes the draft live so
  // every canonical <TalentCard> repaints. Seeded by loadDesignAction() on
  // mount; the working `draft` map repaints the right-hand preview instantly.
  const cardKits = useMemo<CardKitOption[]>(
    () =>
      listCardKits().map((kit) => ({
        slug: kit.slug,
        label: kit.label,
        description: kit.description,
        tokens: kit.tokens,
      })),
    [],
  );
  const [draftTokens, setDraftTokens] = useState<Record<string, string>>({});
  const [liveTokens, setLiveTokens] = useState<Record<string, string>>({});
  const [designVersion, setDesignVersion] = useState(0);
  const [designPublishedAt, setDesignPublishedAt] = useState<string | null>(null);
  const [designReady, setDesignReady] = useState(false);
  const [designLoadError, setDesignLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<DesignSaveState>({ kind: "idle" });
  const [publishState, setPublishState] = useState<DesignPublishState>({ kind: "idle" });
  const [pendingKit, setPendingKit] = useState<string | null>(null);
  const knobDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Engine field candidates (REAL — field_definitions).
  const [fields, setFields] = useState<CardDesignFieldCandidate[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldSaveState>>({});

  // Roster card badge save-state chrome (the prefs themselves live in the
  // AdminShell context, which owns the optimistic flip + revert + toast).
  const [badgeStatus, setBadgeStatus] = useState<Partial<Record<RosterCardBadgeKey, FieldSaveState>>>({});

  // Seed the preview favorite glyph from the tenant's live token.
  useEffect(() => {
    setFavoriteIcon(tenantFavoriteIcon);
  }, [tenantFavoriteIcon]);

  const loadFields = useCallback(() => {
    setLoading(true);
    setFieldsError(null);
    void (async () => {
      const res = await readCardDesignFieldCandidates();
      if (!res.ok) {
        setFieldsError(res.error);
        setFields(null);
      } else {
        setFields(res.data);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const patchAppearance = useCallback(
    <K extends keyof CardAppearance>(key: K, value: CardAppearance[K]) => {
      setAppearance((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Load the current card-design tokens once on mount ─────────────────────
  // Pulls just the card-family slice (kit + 3 color knobs) out of the design
  // snapshot. The CAS `version` seeds every subsequent save/publish.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await loadDesignAction();
      if (cancelled) return;
      if (!res.ok) {
        setDesignLoadError(res.error);
        setDesignReady(true);
        return;
      }
      const pick = (src: Record<string, string>): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const k of CARD_DESIGN_TOKEN_KEYS) out[k] = src[k] ?? "";
        return out;
      };
      setDraftTokens(pick(res.snapshot.themeDraft));
      setLiveTokens(pick(res.snapshot.themeLive));
      setDesignVersion(res.snapshot.version);
      setDesignPublishedAt(res.snapshot.themePublishedAt);
      setDesignReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Has the working draft diverged from what's live? Drives the publish hint.
  const designDirty = useMemo(
    () => CARD_DESIGN_TOKEN_KEYS.some((k) => (draftTokens[k] ?? "") !== (liveTokens[k] ?? "")),
    [draftTokens, liveTokens],
  );
  const activeFamily = draftTokens[CARD_FAMILY_TOKEN_KEY] ?? "";

  // ── Persist the full working draft via the token-save path ────────────────
  const saveDesignDraft = useCallback(
    async (next: Record<string, string>, expected: number) => {
      setSaveState({ kind: "saving" });
      const res = await saveDesignDraftFromEditAction({ patch: next, expectedVersion: expected });
      if (!res.ok) {
        setSaveState({ kind: "error", message: res.error });
        return;
      }
      setDesignVersion(res.version);
      setSaveState({ kind: "saved", version: res.version });
    },
    [],
  );

  // Knob edits debounce so dragging a native color picker doesn't spam saves.
  const handleKnobChange = useCallback(
    (key: string, value: string) => {
      if (!canEdit) return;
      setDraftTokens((prev) => {
        const next = { ...prev, [key]: value };
        if (knobDebounceRef.current) clearTimeout(knobDebounceRef.current);
        knobDebounceRef.current = setTimeout(() => {
          void saveDesignDraft(next, designVersion);
        }, 350);
        return next;
      });
    },
    [canEdit, designVersion, saveDesignDraft],
  );

  // ── Apply a kit (one-click repaint of the whole card family) ──────────────
  const handleApplyKit = useCallback(
    (kit: CardKitOption) => {
      if (!canEdit) {
        toast("You need admin access to change the card design.");
        return;
      }
      setPendingKit(kit.slug);
      setSaveState({ kind: "saving" });
      void (async () => {
        const res = await applyCardKitFromEditAction({ kitSlug: kit.slug });
        setPendingKit(null);
        if (!res.ok) {
          setSaveState({ kind: "error", message: res.error });
          return;
        }
        // Reflect the kit's tokens in the working draft so the preview repaints
        // immediately without a round-trip.
        setDraftTokens((prev) => ({ ...prev, ...kit.tokens }));
        setDesignVersion(res.version);
        setSaveState({ kind: "saved", version: res.version });
      })();
    },
    [canEdit, toast],
  );

  // ── Publish (promote draft → live across every card surface) ──────────────
  const handlePublish = useCallback(() => {
    if (!canPublish) return;
    setPublishState({ kind: "publishing" });
    void (async () => {
      const res = await publishDesignFromEditAction({ expectedVersion: designVersion });
      if (!res.ok) {
        setPublishState({ kind: "error", message: res.error });
        return;
      }
      setDesignVersion(res.version);
      setDesignPublishedAt(new Date().toISOString());
      setPublishState({ kind: "published", version: res.version });
      // Re-seed live from the now-published draft so `designDirty` clears.
      setLiveTokens((prev) => {
        const next = { ...prev };
        for (const k of CARD_DESIGN_TOKEN_KEYS) next[k] = draftTokens[k] ?? "";
        return next;
      });
    })();
  }, [canPublish, designVersion, draftTokens]);

  const handleToggleField = useCallback(
    (key: string, next: boolean) => {
      if (!canEdit) {
        toast("You need admin access to change card fields.");
        return;
      }
      // Optimistic flip.
      setFields((prev) =>
        prev ? prev.map((f) => (f.key === key ? { ...f, cardVisible: next } : f)) : prev,
      );
      setFieldStatus((prev) => ({ ...prev, [key]: "saving" }));
      void (async () => {
        const res = await setFieldCardVisible(key, next);
        if (!res.ok) {
          // Revert.
          setFields((prev) =>
            prev ? prev.map((f) => (f.key === key ? { ...f, cardVisible: !next } : f)) : prev,
          );
          setFieldStatus((prev) => ({ ...prev, [key]: "error" }));
          toast(res.error || "Could not save that field.");
          return;
        }
        setFieldStatus((prev) => ({ ...prev, [key]: "saved" }));
        window.setTimeout(() => {
          setFieldStatus((prev) => {
            const nextState = { ...prev };
            if (nextState[key] === "saved") delete nextState[key];
            return nextState;
          });
        }, 1600);
      })();
    },
    [canEdit, toast],
  );

  const handleToggleBadge = useCallback(
    (key: RosterCardBadgeKey, next: boolean) => {
      if (!canEdit) {
        toast("You need admin access to change roster card badges.");
        return;
      }
      setBadgeStatus((prev) => ({ ...prev, [key]: "saving" }));
      void (async () => {
        // setRosterCardBadge handles the optimistic flip + revert + error toast.
        const ok = await setRosterCardBadge(key, next);
        if (!ok) {
          setBadgeStatus((prev) => ({ ...prev, [key]: "error" }));
          return;
        }
        setBadgeStatus((prev) => ({ ...prev, [key]: "saved" }));
        window.setTimeout(() => {
          setBadgeStatus((prev) => {
            const nextState = { ...prev };
            if (nextState[key] === "saved") delete nextState[key];
            return nextState;
          });
        }, 1600);
      })();
    },
    [canEdit, toast, setRosterCardBadge],
  );

  // Card-visible engine fields → preview chips (cap at the maxFieldLines feel).
  const fieldChips = useMemo(
    () => (fields ?? []).filter((f) => f.cardVisible).slice(0, 4).map((f) => f.label),
    [fields],
  );

  const rule = SURFACE_RULES[activeSurface];
  const isRoster = activeSurface === "roster";

  return (
    <div data-tulala-card-design-studio style={{ fontFamily: FONTS.body, color: COLORS.ink }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: SPACE.group }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
              Card Design
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: COLORS.accentDeep,
                background: COLORS.accentSoft,
                borderRadius: 999,
                padding: "3px 8px",
              }}
            >
              <Icon name="bolt" size={11} color={COLORS.accent} />
              Engine-connected
            </span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.inkMuted, maxWidth: 560, lineHeight: 1.5 }}>
            Control what shows on talent cards, which actions appear, and how every card looks. Card
            fields come straight from your Tulala engine — turn one on here and it appears on every
            card. Pick a look or tune the colors once, then Publish to sync every surface.
          </p>
        </div>
        {!canEdit ? (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.inkMuted }}>
            Read-only
          </span>
        ) : !isRoster && designReady && !designLoadError ? (
          <PublishCluster
            canPublish={canPublish}
            dirty={designDirty}
            publishState={publishState}
            publishedAt={designPublishedAt}
            onPublish={handlePublish}
          />
        ) : null}
      </div>

      {/* Honesty banner — what saves now vs preview-only */}
      <div
        role="note"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: COLORS.indigoSoft,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.md,
          padding: "10px 12px",
          marginBottom: SPACE.group,
        }}
      >
        <Icon name="info" size={15} color={COLORS.indigoDeep} />
        <div style={{ fontSize: 12.5, color: COLORS.indigoDeep, lineHeight: 1.5 }}>
          {isRoster ? (
            <>
              <strong style={{ fontWeight: 600 }}>Roster badges save instantly</strong> to this
              workspace and show or hide on every roster card right away. The roster grid is internal —
              only your team sees it.
            </>
          ) : (
            <>
              <strong style={{ fontWeight: 600 }}>Card fields save instantly</strong> to your engine and
              apply everywhere. <strong style={{ fontWeight: 600 }}>Visual design</strong> (look + colors)
              saves to a draft as you edit — Publish promotes it live across every card surface.{" "}
              <strong style={{ fontWeight: 600 }}>Layout + show-toggles</strong> below are a live preview;
              saving distinct layout per surface ships in the next release.
            </>
          )}
        </div>
      </div>

      {/* Surface tab strip + rationale */}
      <div style={{ marginBottom: SPACE.group }}>
        <CardSurfaceTabStrip
          activeSurface={activeSurface}
          onSurfaceChange={setActiveSurface}
        />
      </div>

      {/* Two-column workspace: controls (left) + preview (right) */}
      <div
        data-tulala-card-design-grid
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: SPACE.section, alignItems: "start" }}
      >
        {/* LEFT — controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.group, minWidth: 0 }}>
          {isRoster ? (
            /* Roster card badges — REAL per-workspace persistence (agencies.settings) */
            <section
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.lg,
                padding: 16,
              }}
            >
              <GroupHeader
                title="Roster card badges"
                hint="Show or hide each overlay on your roster cards. Saved instantly to this workspace — the roster grid is internal to your team."
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {ROSTER_CARD_BADGE_META.map((meta, idx) => {
                  const on = rosterCardBadges[meta.key];
                  const status = badgeStatus[meta.key];
                  const showWarn = !!meta.warnOnHide && !on;
                  return (
                    <div
                      key={meta.key}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 0",
                        borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{meta.label}</div>
                        <div style={{ fontSize: 11.5, color: COLORS.inkDim, marginTop: 2, lineHeight: 1.4 }}>
                          {meta.description}
                        </div>
                        {showWarn ? (
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "flex-start",
                              gap: 5,
                              marginTop: 6,
                              padding: "5px 9px",
                              borderRadius: RADIUS.md,
                              background: COLORS.amberSoft,
                              color: COLORS.amberDeep,
                              fontSize: 11,
                              fontWeight: 600,
                              lineHeight: 1.35,
                            }}
                          >
                            <Icon name="info" size={12} color={COLORS.amberDeep} />
                            <span>
                              Hiding the eye removes the only show / hide control from the card. You can
                              still manage visibility from the talent drawer.
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 1 }}>
                        {status === "saving" ? (
                          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Saving…</span>
                        ) : status === "saved" ? (
                          <span style={{ fontSize: 11, color: COLORS.successDeep, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Icon name="check" size={12} color={COLORS.success} />
                            Saved
                          </span>
                        ) : status === "error" ? (
                          <span style={{ fontSize: 11, color: COLORS.critical }}>Failed</span>
                        ) : null}
                        <Toggle
                          on={on}
                          onChange={canEdit ? (v) => handleToggleBadge(meta.key, v) : undefined}
                          label={`Show ${meta.label} on roster cards`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <>
          {/* Visual design — REAL persistence (card-family design tokens) */}
          <DesignLookSection
            designReady={designReady}
            designLoadError={designLoadError}
            cardKits={cardKits}
            activeFamily={activeFamily}
            pendingKit={pendingKit}
            canEdit={canEdit}
            onApply={handleApplyKit}
            draftTokens={draftTokens}
            onKnobChange={handleKnobChange}
            saveState={saveState}
          />

          {/* Actions on this surface */}
          <section
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: 16,
            }}
          >
            <GroupHeader
              title="Actions on this surface"
              hint="Favorite + inquiry follow Tulala's per-surface rules. Where an action is available you can still hide it."
            />
            <ToggleRow
              label="Favorite (save)"
              hint={rule.favorite ? "Clients can save this talent to their favorites." : undefined}
              on={appearance.showSave}
              onChange={canEdit && rule.favorite ? (v) => patchAppearance("showSave", v) : undefined}
              disabled={!canEdit}
              locked={!rule.favorite}
            />
            <ToggleRow
              label="Inquiry CTA"
              hint={rule.inquiry ? "Clients can start an inquiry from the card." : undefined}
              on={appearance.showAddToInquiry}
              onChange={canEdit && rule.inquiry ? (v) => patchAppearance("showAddToInquiry", v) : undefined}
              disabled={!canEdit}
              locked={!rule.inquiry}
            />
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "10px 0" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Favorite icon</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkDim, marginTop: 2 }}>
                  Tenant brand token{tenantFavoriteIcon ? ` · live: ${tenantFavoriteIcon}` : ""}
                </div>
              </div>
              <Segmented<"heart" | "bookmark">
                value={favoriteIcon}
                onChange={setFavoriteIcon}
                options={[
                  { value: "heart", label: "Heart" },
                  { value: "bookmark", label: "Bookmark" },
                ]}
              />
            </div>
          </section>

          {/* Appearance */}
          <section
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: 16,
            }}
          >
            <GroupHeader title="Layout" hint="How the card is laid out and which lines show. Live preview this release; the Look + Colors above save and publish." />
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted }}>Card style</span>
                <Segmented<CardStyle>
                  value={appearance.cardStyle}
                  onChange={(v) => patchAppearance("cardStyle", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "editorial", label: "Editorial" },
                  ]}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted }}>Image aspect</span>
                <Segmented<CardAspect>
                  value={appearance.cardAspect}
                  onChange={(v) => patchAppearance("cardAspect", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "4:5", label: "4:5" },
                    { value: "1:1", label: "1:1" },
                    { value: "3:4", label: "3:4" },
                    { value: "16:9", label: "16:9" },
                  ]}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.inkMuted }}>Hover behavior</span>
                <Segmented<HoverBehavior>
                  value={appearance.hoverBehavior}
                  onChange={(v) => patchAppearance("hoverBehavior", v)}
                  disabled={!canEdit}
                  options={(Object.keys(HOVER_LABEL) as HoverBehavior[]).map((h) => ({
                    value: h,
                    label: HOVER_LABEL[h],
                  }))}
                />
              </label>
            </div>
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "14px 0 4px" }} />
            <ToggleRow label="Name" on={appearance.showName} onChange={canEdit ? (v) => patchAppearance("showName", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Talent type" on={appearance.showTalentType} onChange={canEdit ? (v) => patchAppearance("showTalentType", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Location" on={appearance.showLocation} onChange={canEdit ? (v) => patchAppearance("showLocation", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Attributes (engine fields)" on={appearance.showAttributes} onChange={canEdit ? (v) => patchAppearance("showAttributes", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Availability" on={appearance.showAvailability} onChange={canEdit ? (v) => patchAppearance("showAvailability", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Trust badges" on={appearance.showBadges} onChange={canEdit ? (v) => patchAppearance("showBadges", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Rating" on={appearance.showRating} onChange={canEdit ? (v) => patchAppearance("showRating", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Price from" on={appearance.showPriceFrom} onChange={canEdit ? (v) => patchAppearance("showPriceFrom", v) : undefined} disabled={!canEdit} />
          </section>

          {/* Engine fields — REAL persistence */}
          <section
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: 16,
            }}
          >
            <GroupHeader
              title="Card fields · from your Tulala engine"
              hint="Which engine fields are eligible to render on cards everywhere. Saved instantly to this workspace."
            />
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 13, color: COLORS.inkMuted }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: `2px solid ${COLORS.borderStrong}`,
                    borderTopColor: COLORS.accent,
                    animation: "tulala-spin 0.7s linear infinite",
                  }}
                />
                Loading fields from the engine…
                <style>{`@keyframes tulala-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : fieldsError ? (
              <div style={{ padding: "8px 0" }}>
                <div style={{ fontSize: 13, color: COLORS.critical, marginBottom: 10 }}>
                  Couldn’t load fields: {fieldsError}
                </div>
                <SecondaryButton size="sm" onClick={loadFields}>
                  Retry
                </SecondaryButton>
              </div>
            ) : !fields || fields.length === 0 ? (
              <EmptyState
                title="No card-eligible fields yet"
                body="Fields become eligible once they’re public and on the profile. Add them in your field catalog first."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {fields.map((f, idx) => {
                  const status = fieldStatus[f.key];
                  return (
                    <div
                      key={f.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "9px 0",
                        borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{f.label}</div>
                        <div style={{ fontSize: 11, color: COLORS.inkDim, marginTop: 1 }}>
                          {f.key}
                          {f.valueType ? ` · ${f.valueType}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {status === "saving" ? (
                          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>Saving…</span>
                        ) : status === "saved" ? (
                          <span style={{ fontSize: 11, color: COLORS.successDeep, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Icon name="check" size={12} color={COLORS.success} />
                            Saved
                          </span>
                        ) : status === "error" ? (
                          <span style={{ fontSize: 11, color: COLORS.critical }}>Failed</span>
                        ) : null}
                        <Toggle
                          on={f.cardVisible}
                          onChange={canEdit ? (v) => handleToggleField(f.key, v) : undefined}
                          label={`Show ${f.label} on cards`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
            </>
          )}
        </div>

        {/* RIGHT — live preview. The canonical <TalentCard> reflects the
            working design draft (the ONLY place gold may appear — it’s the
            public card). The synthetic action card below shows the per-surface
            favorite / inquiry affordances the canonical card doesn’t render. */}
        <CardDesignPreviewColumn
          surfaceLabel={rule.label}
          isRoster={isRoster}
          rosterCardBadges={rosterCardBadges}
          draftTokens={draftTokens}
          activeSurface={activeSurface}
          appearance={appearance}
          favoriteIcon={favoriteIcon}
          fieldChips={fieldChips}
        />
      </div>

      {/* Responsive: stack the preview under the controls on narrow widths */}
      <style>{`
        @media (max-width: 900px) {
          [data-tulala-card-design-grid] {
            grid-template-columns: 1fr !important;
          }
          [data-tulala-card-design-grid] > div:last-child {
            position: static !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
