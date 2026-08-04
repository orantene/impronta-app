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

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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
  saveCardDesignTokensFromEditAction,
} from "@/lib/site-admin/edit-mode/design-actions";
import { CardAppearanceSection } from "./CardDesignStudio-appearance";
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
  CardFeatureToggles,
  CardSurfaceTabStrip,
  DEFAULT_APPEARANCE,
  DesignLookSection,
  GroupHeader,
  HOVER_LABEL,
  HOVER_LABEL_KEY,
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
  const t = useT();
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

  // Seed the preview favorite glyph from the tenant's live token — but only
  // until the design draft (or the operator) provides an explicit value; the
  // draft is the working copy and must not be clobbered by the live attr.
  const favoriteIconPinnedRef = useRef(false);
  useEffect(() => {
    if (favoriteIconPinnedRef.current) return;
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
      const draft = pick(res.snapshot.themeDraft);
      setDraftTokens(draft);
      setLiveTokens(pick(res.snapshot.themeLive));
      setDesignVersion(res.snapshot.version);
      setDesignPublishedAt(res.snapshot.themePublishedAt);
      // Hydrate the preview `appearance` from the persisted tenant defaults so
      // the Layout + Actions controls report the SAVED state after a reload
      // (previously they silently reset to DEFAULT_APPEARANCE).
      setAppearance((prev) => ({
        ...prev,
        ...(draft["directory.card.style"]
          ? { cardStyle: draft["directory.card.style"] as CardAppearance["cardStyle"] }
          : {}),
        ...(draft["directory.card.aspect"]
          ? { cardAspect: draft["directory.card.aspect"] as CardAppearance["cardAspect"] }
          : {}),
        ...(draft["directory.card.hover"]
          ? { hoverBehavior: draft["directory.card.hover"] as CardAppearance["hoverBehavior"] }
          : {}),
        ...(draft["directory.card.density"]
          ? { density: draft["directory.card.density"] as CardAppearance["density"] }
          : {}),
        showSave: draft["directory.card.show-favorite"] !== "off",
        showAddToInquiry: draft["directory.card.show-inquiry"] !== "off",
      }));
      const draftIcon = draft["favorite.icon"];
      if (draftIcon === "heart" || draftIcon === "bookmark") {
        favoriteIconPinnedRef.current = true;
        setFavoriteIcon(draftIcon);
      }
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

  // ── Persist the card-token working map via the MERGE save path ────────────
  // This panel only holds CARD_DESIGN_TOKEN_KEYS, so it must NOT use the
  // full-replacement `saveDesignDraftFromEditAction` (that path expects the
  // ThemeDrawer's complete registry map and would strip every non-card token
  // from the draft). The merge action reads the stored draft server-side and
  // lays these keys on top, so page-canvas / font / accent tokens survive.
  const saveDesignDraft = useCallback(
    async (next: Record<string, string>) => {
      setSaveState({ kind: "saving" });
      const res = await saveCardDesignTokensFromEditAction({
        patch: next,
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
          void saveDesignDraft(next);
        }, 350);
        return next;
      });
    },
    [canEdit, saveDesignDraft],
  );

  // ── Reviews-on-cards template tokens (REAL persistence — same path as the
  // color knobs above: write into the working `draftTokens` map, then save
  // it through `saveDesignDraft` → `saveCardDesignTokensFromEditAction`, which
  // merges onto the stored draft server-side. Publish promotes the draft live
  // like every other card token). No debounce: these are discrete
  // toggle/segmented clicks, not a dragged color picker. All of these keys are
  // listed in CARD_DESIGN_TOKEN_KEYS (CardDesignStudio-3.tsx), so they re-seed
  // on reload and light `designDirty` like the color knobs.
  const readTemplateToken = useCallback(
    (key: string) => draftTokens[key] || STANDING_DEFAULTS[key] || "",
    [draftTokens],
  );
  const setTemplateToken = useCallback(
    (key: string, value: string) => {
      if (!canEdit) {
        toast(t("dashboard.adminCardStudio.toastNeedAdminDesign"));
        return;
      }
      setDraftTokens((prev) => {
        const next = { ...prev, [key]: value };
        // Cancel any pending debounced knob save — its stale snapshot would
        // otherwise land AFTER this save and revert the toggle. The knob's
        // edit is already inside `next`, so nothing is lost.
        if (knobDebounceRef.current) {
          clearTimeout(knobDebounceRef.current);
          knobDebounceRef.current = null;
        }
        void saveDesignDraft(next);
        return next;
      });
    },
    [canEdit, toast, t, saveDesignDraft],
  );

  /** Layout knob → preview state AND the persisted tenant-wide default. */
  const setLayoutDefault = useCallback(
    (key: keyof CardAppearance, tokenKey: string, value: string) => {
      patchAppearance(key, value as never);
      if (canEdit) setTemplateToken(tokenKey, value);
    },
    [patchAppearance, canEdit, setTemplateToken],
  );

  // ── Apply a kit (one-click repaint of the whole card family) ──────────────
  const handleApplyKit = useCallback(
    (kit: CardKitOption) => {
      if (!canEdit) {
        toast(t("dashboard.adminCardStudio.toastNeedAdminDesign"));
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
    [canEdit, toast, t, tenantSlug],
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
        toast(t("dashboard.adminCardStudio.toastNeedAdminFields"));
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
          toast(res.error || t("dashboard.adminCardStudio.toastCouldNotSaveField"));
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
    [canEdit, toast, t, tenantSlug],
  );

  const handleToggleBadge = useCallback(
    (key: RosterCardBadgeKey, next: boolean) => {
      if (!canEdit) {
        toast(t("dashboard.adminCardStudio.toastNeedAdminBadges"));
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
    [canEdit, toast, t, setRosterCardBadge],
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
              {t("dashboard.adminCardStudio.title")}
            </h1>
            <span className="inline-flex items-center gap-[4px] rounded-[999px] bg-admin-accent-soft px-[8px] py-[3px] text-admin-10h font-bold uppercase tracking-[0.4px] text-admin-accent-deep">
              <Icon name="bolt" size={11} color={COLORS.accent} />
              {t("dashboard.adminCardStudio.engineConnected")}
            </span>
          </div>
          <p className="m-0 mt-[6px] max-w-[560px] text-admin-13 leading-[1.5] text-admin-ink-muted">
            {t("dashboard.adminCardStudio.headerDescription")}
          </p>
        </div>
        {!canEdit ? (
          <span className="text-admin-11 font-semibold uppercase tracking-[0.4px] text-admin-ink-muted">
            {t("dashboard.adminCardStudio.readOnly")}
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
              <strong className="font-semibold">{t("dashboard.adminCardStudio.bannerRosterLead")}</strong>
              {t("dashboard.adminCardStudio.bannerRosterRest")}
            </>
          ) : (
            <>
              <strong className="font-semibold">{t("dashboard.adminCardStudio.bannerFieldsLead")}</strong>
              {t("dashboard.adminCardStudio.bannerFieldsMid")}{" "}
              <strong className="font-semibold">{t("dashboard.adminCardStudio.bannerDesignLead")}</strong>
              {t("dashboard.adminCardStudio.bannerDesignMid")}{" "}
              <strong className="font-semibold">{t("dashboard.adminCardStudio.bannerLayoutLead")}</strong>
              {t("dashboard.adminCardStudio.bannerLayoutRest")}
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
                title={t("dashboard.adminCardStudio.rosterBadgesTitle")}
                hint={t("dashboard.adminCardStudio.rosterBadgesHint")}
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
                            <span>{t("dashboard.adminCardStudio.badgeHideEyeWarn")}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-[8px] pt-px">
                        {status === "saving" ? (
                          <span className="text-admin-11 text-admin-ink-muted">{t("dashboard.adminCardStudio.saving")}</span>
                        ) : status === "saved" ? (
                          <span className="inline-flex items-center gap-[3px] text-admin-11 text-admin-success-deep">
                            <Icon name="check" size={12} color={COLORS.success} />
                            {t("dashboard.adminCardStudio.saved")}
                          </span>
                        ) : status === "error" ? (
                          <span className="text-admin-11 text-admin-critical">{t("dashboard.adminCardStudio.failed")}</span>
                        ) : null}
                        <Toggle
                          on={on}
                          onChange={canEdit ? (v) => handleToggleBadge(meta.key, v) : undefined}
                          label={interpolate(t("dashboard.adminCardStudio.showBadgeOnRosterAria"), { label: meta.label })}
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
              title={t("dashboard.adminCardStudio.actionsTitle")}
              hint={t("dashboard.adminCardStudio.actionsHint")}
            />
            {/* Persisted tenant-wide ceilings (same lifecycle as the Look
                tokens: draft on toggle, Publish promotes live). The preview
                `appearance` is patched in the same click so the sample card
                reacts instantly. */}
            <ToggleRow
              label={t("dashboard.adminCardStudio.favoriteSaveLabel")}
              hint={rule.favorite ? t("dashboard.adminCardStudio.favoriteSaveHint") : undefined}
              on={readTemplateToken("directory.card.show-favorite") !== "off"}
              onChange={
                canEdit && rule.favorite
                  ? (v) => {
                      patchAppearance("showSave", v);
                      setTemplateToken("directory.card.show-favorite", v ? "on" : "off");
                    }
                  : undefined
              }
              disabled={!canEdit}
              locked={!rule.favorite}
            />
            <ToggleRow
              label={t("dashboard.adminCardStudio.inquiryCtaLabel")}
              hint={rule.inquiry ? t("dashboard.adminCardStudio.inquiryCtaHint") : undefined}
              on={readTemplateToken("directory.card.show-inquiry") !== "off"}
              onChange={
                canEdit && rule.inquiry
                  ? (v) => {
                      patchAppearance("showAddToInquiry", v);
                      setTemplateToken("directory.card.show-inquiry", v ? "on" : "off");
                    }
                  : undefined
              }
              disabled={!canEdit}
              locked={!rule.inquiry}
            />
            <div className="my-[10px] h-px bg-admin-border-soft" />
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="text-admin-13 font-medium">
                  {t("dashboard.adminCardStudio.favoriteIconLabel")}
                </div>
                <div className="mt-[2px] text-admin-11h text-admin-ink-dim">
                  {t("dashboard.adminCardStudio.tenantBrandToken")}
                  {tenantFavoriteIcon ? interpolate(t("dashboard.adminCardStudio.liveIconSuffix"), { icon: tenantFavoriteIcon }) : ""}
                </div>
              </div>
              <Segmented<"heart" | "bookmark">
                value={favoriteIcon}
                onChange={(v) => {
                  favoriteIconPinnedRef.current = true;
                  setFavoriteIcon(v);
                  // Persist to the `favorite.icon` design token — the CSS in
                  // talent-card-actions.css keys off the projected
                  // `data-token-favorite-icon` on <html>, so Publish flips the
                  // glyph on every card surface.
                  if (canEdit) setTemplateToken("favorite.icon", v);
                }}
                options={[
                  { value: "heart", label: t("dashboard.adminCardStudio.iconHeart") },
                  { value: "bookmark", label: t("dashboard.adminCardStudio.iconBookmark") },
                ]}
              />
            </div>
          </section>

          <CardAppearanceSection
            t={t}
            canEdit={canEdit}
            appearance={appearance}
            patchAppearance={patchAppearance}
            setLayoutDefault={setLayoutDefault}
            readTemplateToken={readTemplateToken}
            setTemplateToken={setTemplateToken}
          />

          {/* Engine fields — REAL persistence */}
          <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
            <GroupHeader
              title={t("dashboard.adminCardStudio.cardFieldsTitle")}
              hint={t("dashboard.adminCardStudio.cardFieldsHint")}
            />
            {loading ? (
              <div className="flex items-center gap-[8px] py-[12px] text-admin-13 text-admin-ink-muted">
                <span className="h-[14px] w-[14px] rounded-full border-2 border-admin-border-strong border-t-admin-accent [animation:tulala-spin_0.7s_linear_infinite]" />
                {t("dashboard.adminCardStudio.loadingFields")}
                <style>{`@keyframes tulala-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : fieldsError ? (
              <div className="py-[8px]">
                <div className="mb-[10px] text-admin-13 text-admin-critical">
                  {interpolate(t("dashboard.adminCardStudio.couldNotLoadFields"), { error: fieldsError })}
                </div>
                <SecondaryButton size="sm" onClick={loadFields}>
                  {t("dashboard.adminCardStudio.retry")}
                </SecondaryButton>
              </div>
            ) : !fields || fields.length === 0 ? (
              <EmptyState
                title={t("dashboard.adminCardStudio.fieldsEmptyTitle")}
                body={t("dashboard.adminCardStudio.fieldsEmptyBody")}
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
                          <span className="text-admin-11 text-admin-ink-muted">{t("dashboard.adminCardStudio.saving")}</span>
                        ) : status === "saved" ? (
                          <span className="inline-flex items-center gap-[3px] text-admin-11 text-admin-success-deep">
                            <Icon name="check" size={12} color={COLORS.success} />
                            {t("dashboard.adminCardStudio.saved")}
                          </span>
                        ) : status === "error" ? (
                          <span className="text-admin-11 text-admin-critical">{t("dashboard.adminCardStudio.failed")}</span>
                        ) : null}
                        <Toggle
                          on={f.cardVisible}
                          onChange={canEdit ? (v) => handleToggleField(f.key, v) : undefined}
                          label={interpolate(t("dashboard.adminCardStudio.showFieldOnCardsAria"), { label: f.label })}
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
          surfaceLabel={t(rule.labelKey)}
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
