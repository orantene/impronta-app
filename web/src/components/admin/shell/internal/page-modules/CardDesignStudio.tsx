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
import { COLORS, meetsRole, useAdminShell } from "../state";
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

// Registry defaults for the reviews-on-cards template tokens. Module scope so
// readTemplateToken's dependency array can stay honest (only draftTokens varies).
const STANDING_DEFAULTS: Record<string, string> = {
  "directory.card.show-standing": "compact",
  "directory.card.standing-style": "both",
  "profile.reviews-visibility": "visible",
};

export function CardDesignStudio() {
  const { state, toast, rosterCardBadges, setRosterCardBadge, tenantSlug } =
    useAdminShell();
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
      const res = await readCardDesignFieldCandidates({ tenantSlug });
      if (!res.ok) {
        setFieldsError(res.error);
        setFields(null);
      } else {
        setFields(res.data);
      }
      setLoading(false);
    })();
  }, [tenantSlug]);

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
      const res = await loadDesignAction({ tenantSlug });
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
  }, [tenantSlug]);

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
      const res = await saveDesignDraftFromEditAction({
        patch: next,
        expectedVersion: expected,
        tenantSlug,
      });
      if (!res.ok) {
        setSaveState({ kind: "error", message: res.error });
        return;
      }
      setDesignVersion(res.version);
      setSaveState({ kind: "saved", version: res.version });
    },
    [tenantSlug],
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

  // ── Reviews-on-cards template tokens (REAL persistence — same path as the
  // color knobs above: write into the working `draftTokens` map, then save
  // the full map through `saveDesignDraft` → `saveDesignDraftFromEditAction`.
  // Publish promotes the draft live like every other card token). No debounce:
  // these are discrete toggle/segmented clicks, not a dragged color picker.
  //
  // TODO(reviewer): `CARD_DESIGN_TOKEN_KEYS` (defined in CardDesignStudio-3.tsx,
  // not owned by this change) does NOT list these three keys. Consequences:
  //   1. loadDesignAction's `pick()` only seeds `draftTokens` with
  //      CARD_DESIGN_TOKEN_KEYS, so on reload these controls fall back to the
  //      registry defaults (off / both / visible) for their DISPLAYED state even
  //      if a non-default value is live. The SETTING itself persists (the save
  //      patch carries the key), it just isn't reflected back in this panel
  //      after a refresh until CARD_DESIGN_TOKEN_KEYS includes these keys.
  //   2. `designDirty` and the publish re-seed loop also iterate
  //      CARD_DESIGN_TOKEN_KEYS, so a change to ONLY these tokens won't light the
  //      publish button via `designDirty`. Editing any card-family token (kit or
  //      color knob) makes the panel dirty and Publish then promotes ALL draft
  //      tokens including these. Adding the three keys to CARD_DESIGN_TOKEN_KEYS
  //      in -3 closes both gaps; that file is owned by another change.
  const readTemplateToken = useCallback(
    (key: string) => draftTokens[key] || STANDING_DEFAULTS[key] || "",
    [draftTokens],
  );
  const setTemplateToken = useCallback(
    (key: string, value: string) => {
      if (!canEdit) {
        toast("You need admin access to change the card design.");
        return;
      }
      setDraftTokens((prev) => {
        const next = { ...prev, [key]: value };
        void saveDesignDraft(next, designVersion);
        return next;
      });
    },
    [canEdit, toast, designVersion, saveDesignDraft],
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
        const res = await applyCardKitFromEditAction({
          kitSlug: kit.slug,
          tenantSlug,
        });
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
    [canEdit, toast, tenantSlug],
  );

  // ── Publish (promote draft → live across every card surface) ──────────────
  const handlePublish = useCallback(() => {
    if (!canPublish) return;
    setPublishState({ kind: "publishing" });
    void (async () => {
      const res = await publishDesignFromEditAction({
        expectedVersion: designVersion,
        tenantSlug,
      });
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
  }, [canPublish, designVersion, draftTokens, tenantSlug]);

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
        const res = await setFieldCardVisible(key, next, tenantSlug);
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
    [canEdit, toast, tenantSlug],
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
    <div data-tulala-card-design-studio className="font-admin-body text-admin-ink">
      {/* Header */}
      <div className="mb-[24px] flex flex-wrap items-start justify-between gap-[16px]">
        <div>
          <div className="flex items-center gap-[8px]">
            <h1 className="m-0 font-admin-display text-admin-22 font-semibold tracking-[-0.3px]">
              Card Design
            </h1>
            <span className="inline-flex items-center gap-[4px] rounded-[999px] bg-admin-accent-soft px-[8px] py-[3px] text-admin-10h font-bold uppercase tracking-[0.4px] text-admin-accent-deep">
              <Icon name="bolt" size={11} color={COLORS.accent} />
              Engine-connected
            </span>
          </div>
          <p className="m-0 mt-[6px] max-w-[560px] text-admin-13 leading-[1.5] text-admin-ink-muted">
            Control what shows on talent cards, which actions appear, and how every card looks. Card
            fields come straight from your Tulala engine — turn one on here and it appears on every
            card. Pick a look or tune the colors once, then Publish to sync every surface.
          </p>
        </div>
        {!canEdit ? (
          <span className="text-admin-11 font-semibold uppercase tracking-[0.4px] text-admin-ink-muted">
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
        className="mb-[24px] flex items-start gap-[10px] rounded-admin-md border border-admin-border-soft bg-admin-indigo-soft px-[12px] py-[10px]"
      >
        <Icon name="info" size={15} color={COLORS.indigoDeep} />
        <div className="text-admin-12h leading-[1.5] text-admin-indigo-deep">
          {isRoster ? (
            <>
              <strong className="font-semibold">Roster badges save instantly</strong> to this
              workspace and show or hide on every roster card right away. The roster grid is internal —
              only your team sees it.
            </>
          ) : (
            <>
              <strong className="font-semibold">Card fields save instantly</strong> to your engine and
              apply everywhere. <strong className="font-semibold">Visual design</strong> (look + colors)
              saves to a draft as you edit — Publish promotes it live across every card surface.{" "}
              <strong className="font-semibold">Layout + show-toggles</strong> below are a live preview;
              saving distinct layout per surface ships in the next release.
            </>
          )}
        </div>
      </div>

      {/* Surface tab strip + rationale */}
      <div className="mb-[24px]">
        <CardSurfaceTabStrip activeSurface={activeSurface} onSurfaceChange={setActiveSurface} />
      </div>

      {/* Two-column workspace: controls (left) + preview (right) */}
      <div
        data-tulala-card-design-grid
        className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-[32px]"
      >
        {/* LEFT — controls */}
        <div className="flex min-w-0 flex-col gap-[24px]">
          {isRoster ? (
            /* Roster card badges — REAL per-workspace persistence (agencies.settings) */
            <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
              <GroupHeader
                title="Roster card badges"
                hint="Show or hide each overlay on your roster cards. Saved instantly to this workspace — the roster grid is internal to your team."
              />
              <div className="flex flex-col">
                {ROSTER_CARD_BADGE_META.map((meta, idx) => {
                  const on = rosterCardBadges[meta.key];
                  const status = badgeStatus[meta.key];
                  const showWarn = !!meta.warnOnHide && !on;
                  return (
                    <div
                      key={meta.key}
                      className={`flex items-start justify-between gap-[12px] py-[10px] ${
                        idx === 0 ? "" : "border-t border-admin-border-soft"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-admin-13 font-medium text-admin-ink">{meta.label}</div>
                        <div className="mt-[2px] text-admin-11h leading-[1.4] text-admin-ink-dim">
                          {meta.description}
                        </div>
                        {showWarn ? (
                          <div className="mt-[6px] inline-flex items-start gap-[5px] rounded-admin-md bg-admin-amber-soft px-[9px] py-[5px] text-admin-11 font-semibold leading-[1.35] text-admin-amber-deep">
                            <Icon name="info" size={12} color={COLORS.amberDeep} />
                            <span>
                              Hiding the eye removes the only show / hide control from the card. You can
                              still manage visibility from the talent drawer.
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-[8px] pt-px">
                        {status === "saving" ? (
                          <span className="text-admin-11 text-admin-ink-muted">Saving…</span>
                        ) : status === "saved" ? (
                          <span className="inline-flex items-center gap-[3px] text-admin-11 text-admin-success-deep">
                            <Icon name="check" size={12} color={COLORS.success} />
                            Saved
                          </span>
                        ) : status === "error" ? (
                          <span className="text-admin-11 text-admin-critical">Failed</span>
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
          <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
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
            <div className="my-[10px] h-px bg-admin-border-soft" />
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="text-admin-13 font-medium">Favorite icon</div>
                <div className="mt-[2px] text-admin-11h text-admin-ink-dim">
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
          <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
            <GroupHeader title="Layout" hint="How the card is laid out and which lines show. Live preview this release; the Look + Colors above save and publish." />
            <div className="flex flex-col gap-[14px]">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">Card style</span>
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
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">Image aspect</span>
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
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">Hover behavior</span>
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
            <div className="mx-0 mb-[4px] mt-[14px] h-px bg-admin-border-soft" />
            <ToggleRow label="Name" on={appearance.showName} onChange={canEdit ? (v) => patchAppearance("showName", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Talent type" on={appearance.showTalentType} onChange={canEdit ? (v) => patchAppearance("showTalentType", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Location" on={appearance.showLocation} onChange={canEdit ? (v) => patchAppearance("showLocation", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Attributes (engine fields)" on={appearance.showAttributes} onChange={canEdit ? (v) => patchAppearance("showAttributes", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Availability" on={appearance.showAvailability} onChange={canEdit ? (v) => patchAppearance("showAvailability", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Trust badges" on={appearance.showBadges} onChange={canEdit ? (v) => patchAppearance("showBadges", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Rating" on={appearance.showRating} onChange={canEdit ? (v) => patchAppearance("showRating", v) : undefined} disabled={!canEdit} />
            <ToggleRow label="Price from" on={appearance.showPriceFrom} onChange={canEdit ? (v) => patchAppearance("showPriceFrom", v) : undefined} disabled={!canEdit} />

            {/* Reviews on cards — REAL persistence (template tokens; see
                setTemplateToken). Master on/off maps show-standing off↔compact;
                the style picker + profile visibility mirror the price idiom. */}
            <div className="mx-0 mb-[4px] mt-[14px] h-px bg-admin-border-soft" />
            <div className="mx-0 mb-[2px] mt-[6px] text-[12px] font-semibold text-admin-ink-muted">
              Reviews on cards
            </div>
            <ToggleRow
              label="Show talent standing"
              hint="Ratings / standing on directory cards. Saves to the design draft; Publish syncs every surface."
              on={readTemplateToken("directory.card.show-standing") !== "off"}
              onChange={canEdit ? (v) => setTemplateToken("directory.card.show-standing", v ? "compact" : "off") : undefined}
              disabled={!canEdit}
            />
            {readTemplateToken("directory.card.show-standing") !== "off" ? (
              <label className="mt-[10px] flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">Standing style</span>
                <Segmented<"tier" | "signal" | "both">
                  value={
                    (readTemplateToken("directory.card.standing-style") as
                      | "tier"
                      | "signal"
                      | "both") || "both"
                  }
                  onChange={(v) => setTemplateToken("directory.card.standing-style", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "tier", label: "Tier" },
                    { value: "signal", label: "Signal" },
                    { value: "both", label: "Both" },
                  ]}
                />
              </label>
            ) : null}
            <div className="mt-[10px]">
              <ToggleRow
                label="Reviews on profile pages"
                hint="Show or hide the whole reviews section on talent profiles."
                on={readTemplateToken("profile.reviews-visibility") !== "hidden"}
                onChange={canEdit ? (v) => setTemplateToken("profile.reviews-visibility", v ? "visible" : "hidden") : undefined}
                disabled={!canEdit}
              />
            </div>
          </section>

          {/* Engine fields — REAL persistence */}
          <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
            <GroupHeader
              title="Card fields · from your Tulala engine"
              hint="Which engine fields are eligible to render on cards everywhere. Saved instantly to this workspace."
            />
            {loading ? (
              <div className="flex items-center gap-[8px] py-[12px] text-admin-13 text-admin-ink-muted">
                <span className="h-[14px] w-[14px] rounded-full border-2 border-admin-border-strong border-t-admin-accent [animation:tulala-spin_0.7s_linear_infinite]" />
                Loading fields from the engine…
                <style>{`@keyframes tulala-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : fieldsError ? (
              <div className="py-[8px]">
                <div className="mb-[10px] text-admin-13 text-admin-critical">
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
              <div className="flex flex-col">
                {fields.map((f, idx) => {
                  const status = fieldStatus[f.key];
                  return (
                    <div
                      key={f.key}
                      className={`flex items-center justify-between gap-[12px] py-[9px] ${
                        idx === 0 ? "" : "border-t border-admin-border-soft"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-admin-13 font-medium text-admin-ink">{f.label}</div>
                        <div className="mt-px text-admin-11 text-admin-ink-dim">
                          {f.key}
                          {f.valueType ? ` · ${f.valueType}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-[8px]">
                        {status === "saving" ? (
                          <span className="text-admin-11 text-admin-ink-muted">Saving…</span>
                        ) : status === "saved" ? (
                          <span className="inline-flex items-center gap-[3px] text-admin-11 text-admin-success-deep">
                            <Icon name="check" size={12} color={COLORS.success} />
                            Saved
                          </span>
                        ) : status === "error" ? (
                          <span className="text-admin-11 text-admin-critical">Failed</span>
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
