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

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type CardDesignFieldCandidate,
  readCardDesignFieldCandidates,
  setFieldCardVisible,
} from "@/lib/site-admin/server/directory-catalogs";
import { useFavoriteIcon } from "@/lib/talent-cards/use-favorite-icon";
import { EmptyState, Icon, SecondaryButton, Toggle } from "../primitives";
import { COLORS, FONTS, RADIUS, SPACE, TRANSITION, meetsRole, useAdminShell } from "../state";
import {
  type CardAppearance,
  type CardAspect,
  type CardStyle,
  type CardSurface,
  type FieldSaveState,
  type HoverBehavior,
  DEFAULT_APPEARANCE,
  GroupHeader,
  HOVER_LABEL,
  PreviewCard,
  Segmented,
  SURFACE_ORDER,
  SURFACE_RULES,
  ToggleRow,
} from "./CardDesignStudio-2";

// ────────────────────────────────────────────────────────────────────────
// Main studio
// ────────────────────────────────────────────────────────────────────────

export function CardDesignStudio() {
  const { state, toast } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const tenantFavoriteIcon = useFavoriteIcon();

  const [activeSurface, setActiveSurface] = useState<CardSurface>("directory");
  const [appearance, setAppearance] = useState<CardAppearance>(DEFAULT_APPEARANCE);
  const [favoriteIcon, setFavoriteIcon] = useState<"heart" | "bookmark">("heart");

  // Engine field candidates (REAL — field_definitions).
  const [fields, setFields] = useState<CardDesignFieldCandidate[] | null>(null);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldSaveState>>({});

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

  // Card-visible engine fields → preview chips (cap at the maxFieldLines feel).
  const fieldChips = useMemo(
    () => (fields ?? []).filter((f) => f.cardVisible).slice(0, 4).map((f) => f.label),
    [fields],
  );

  const rule = SURFACE_RULES[activeSurface];

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
            Control what shows on talent cards and which actions appear, per surface. Card fields come
            straight from your Tulala engine — turn one on here and it appears on every card.
          </p>
        </div>
        {!canEdit ? (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.inkMuted }}>
            Read-only
          </span>
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
          <strong style={{ fontWeight: 600 }}>Card fields save instantly</strong> to your engine and
          apply everywhere. <strong style={{ fontWeight: 600 }}>Per-surface styling</strong> below is a
          live preview — saving distinct styling per surface ships in the next release.
        </div>
      </div>

      {/* Surface tab strip */}
      <div
        role="tablist"
        aria-label="Card surface"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}
      >
        {SURFACE_ORDER.map((s) => {
          const r = SURFACE_RULES[s];
          const active = s === activeSurface;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSurface(s)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                borderRadius: RADIUS.md,
                border: `1px solid ${active ? COLORS.ink : COLORS.border}`,
                background: active ? COLORS.card : "transparent",
                boxShadow: active ? COLORS.shadow : "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? COLORS.ink : COLORS.inkMuted,
                transition: `border-color ${TRANSITION.sm}`,
              }}
            >
              {r.label}
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: r.favorite || r.inquiry ? COLORS.accentDeep : COLORS.inkDim,
                  background: r.favorite || r.inquiry ? COLORS.accentSoft : COLORS.surfaceAlt,
                  borderRadius: 999,
                  padding: "2px 6px",
                }}
              >
                {r.tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active surface rationale */}
      <div
        style={{
          fontSize: 12.5,
          color: COLORS.inkMuted,
          lineHeight: 1.5,
          padding: "10px 12px",
          background: COLORS.surfaceAlt,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: RADIUS.md,
          marginBottom: SPACE.group,
        }}
      >
        {rule.note}
      </div>

      {/* Two-column workspace: controls (left) + preview (right) */}
      <div
        data-tulala-card-design-grid
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: SPACE.section, alignItems: "start" }}
      >
        {/* LEFT — controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.group, minWidth: 0 }}>
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
            <GroupHeader title="Appearance" hint="How the card is laid out. Preview-only this release." />
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
        </div>

        {/* RIGHT — live preview */}
        <div style={{ position: "sticky", top: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, alignSelf: "flex-start" }}>
            {rule.label} preview
          </div>
          <PreviewCard
            surface={activeSurface}
            appearance={appearance}
            favoriteIcon={favoriteIcon}
            fieldChips={fieldChips}
          />
          <div style={{ fontSize: 11, color: COLORS.inkDim, textAlign: "center", maxWidth: 260, lineHeight: 1.45 }}>
            Favorite + inquiry here are interactive so you can see both states. On the live surface they
            connect to the client’s real favorites and inquiry list.
          </div>
        </div>
      </div>

      {/* Responsive: stack the preview under the controls on narrow widths */}
      <style>{`
        @media (max-width: 900px) {
          [data-tulala-card-design-grid] {
            grid-template-columns: 1fr !important;
          }
          [data-tulala-card-design-grid] > div:last-child {
            position: static !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  );
}
