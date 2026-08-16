// Phase-1f decomp — core editors that the active section body composes
// (Services / Bios / Rates / Availability / Verifications) plus the
// per-talent advanced agency settings expander.  Byte-for-byte; pulls
// findChild from ./profile-state and the talent-type pickers from
// ./talent-type-picker — same shape the monolith used internally.
"use client";
import React, { useState } from "react";
import {
  AvailabilityCell,
  AvailabilityStatus,
  COLORS,
  FONTS,
  LOCALE_LABEL,
  LocaleBio,
  LocaleCode,
  ProfileRate,
  RateUnit,
  SkillOverridesPanel,
  TALENT_TRUST_META,
  TYPE_RATE_UNIT,
  TaxonomyChild,
  TaxonomyParent,
  ToggleControl,
  TrustTier,
  Verifications,
  shortParentLabel,
  useDashboardText,
} from "../../drawer-shared";
import { findChild } from "./profile-state";
import {
  PrimaryTalentTypeGrid,
  SiblingTopNPicker,
} from "./talent-type-picker";

export function AdvancedAgencySettingsSection({
  talentProfileId,
}: {
  talentProfileId: string;
}) {
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: "0 24px", marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`,
          background: open ? COLORS.surfaceAlt : "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONTS.body,
        }}
      >
        <span
          aria-hidden
          style={{ fontSize: 11, color: COLORS.inkMuted, width: 10 }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span className="flex-1 min-w-0">
          <span style={{ display: "block", fontSize: 12, fontWeight: 600 }} className="text-admin-ink">
            {copy.t("Advanced agency settings")}
          </span>
          <span style={{ display: "block", fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
            {copy.t("Per-agency visibility, featured, display order & internal notes")}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-2">
          <SkillOverridesPanel
            talentProfileId={talentProfileId}
            viewMode="admin"
          />
        </div>
      )}
    </div>
  );
}


export function ServicesEditor({
  allowedParents, primaryType, secondaryTypes, specialties, primaryRes, specialtyOptions,
  onPickPrimary, onClearPrimary, onToggleSecondary, onToggleSpecialty, hydrating,
  tenantEnabledPrimarySlugs,
  tenantEnabledSecondarySlugs,
  tenantSettingsHref,
}: {
  allowedParents: TaxonomyParent[];
  primaryType: string | null;
  secondaryTypes: string[];
  specialties: string[];
  primaryRes: { parent: TaxonomyParent; child: TaxonomyChild } | null;
  specialtyOptions: { typeId: string; typeLabel: string; items: string[] }[];
  onPickPrimary: (id: string) => void;
  onClearPrimary: () => void;
  onToggleSecondary: (id: string) => void;
  onToggleSpecialty: (s: string) => void;
  /** True while the talent profile is still hydrating from the server.
   *  Prevents flashing the "pick a primary type" grid (false "Not set")
   *  for a talent who actually has a persisted type still loading. */
  hydrating?: boolean;
  /** Slugs ENABLED in the current tenant's agency_taxonomy_settings. When
   *  `primaryType` is NOT in this set, the primary chip renders faded with
   *  a "Disabled in your workspace — Enable in Settings →" hint, letting
   *  Alejandra SEE Moran's chosen talent type while flagging it as not
   *  active in her agency. Optional — when omitted (standalone /
   *  pre-tenant-context), no fading is applied. */
  tenantEnabledPrimarySlugs?: Set<string>;
  /** Phase 2b — slugs ENABLED for SECONDARY in the current tenant's
   *  agency_taxonomy_settings. Threaded to each SiblingTopNPicker so any
   *  "Also bookable as" chip whose slug isn't enabled renders faded.
   *  Optional; omit to keep every secondary chip full contrast. */
  tenantEnabledSecondarySlugs?: Set<string>;
  /** Deep-link to the agency taxonomy settings drawer; surfaces as
   *  "Enable in Settings →" next to a faded chip. */
  tenantSettingsHref?: string;
}) {
  // Phase 2 — fade signal. Only fires when this tenant context is known AND
  // the talent's selected primary type is NOT in the tenant's enabled set.
  const primaryDisabledForTenant =
    !!tenantEnabledPrimarySlugs &&
    !!primaryType &&
    !tenantEnabledPrimarySlugs.has(primaryType);
  // 2026 — when a primary role is picked, default the "Also bookable as"
  // wall to siblings within the same parent_category. The cross-category
  // chips (e.g. picking a Performer when the primary is a Model) live
  // behind an explicit toggle so the picker isn't 80 random chips at once.
  const [showOtherCategories, setShowOtherCategories] = useState(false);
  const copy = useDashboardText();
  const primaryParentId = primaryRes?.parent.id ?? null;
  const sameCategoryChildren = primaryParentId
    ? allowedParents.find(p => p.id === primaryParentId)?.children ?? []
    : allowedParents.flatMap(p => p.children);
  const otherCategories = primaryParentId
    ? allowedParents.filter(p => p.id !== primaryParentId)
    : [];
  return (
    <>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 4 }} className="text-admin-ink-muted">
          {copy.t("Booked as")}
        </div>
        <div style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.4 }} className="text-admin-ink-dim">
          {copy.t("What clients book this person as. Pick the main one.")}
        </div>
        {primaryRes ? (
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                background: primaryDisabledForTenant
                  ? "rgba(11,11,13,0.04)"
                  : "rgba(15,79,62,0.08)",
                border: `1.5px solid ${primaryDisabledForTenant ? COLORS.borderSoft : COLORS.accent}`,
                fontSize: 13,
                fontWeight: 600,
                opacity: primaryDisabledForTenant ? 0.55 : 1,
              }}
              className={primaryDisabledForTenant ? "text-admin-ink-muted" : "text-admin-accent-deep"}
              title={
                primaryDisabledForTenant
                  ? copy.t("This talent type isn't enabled in your workspace. Enable it in Settings → Roster → Talent types.")
                  : undefined
              }
            >
              <span className="text-sm">{primaryRes.parent.emoji}</span>
              {primaryRes.child.label}
              <button
                type="button"
                onClick={onClearPrimary}
                aria-label={copy.t("Change main service")}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: primaryDisabledForTenant ? COLORS.inkMuted : COLORS.accentDeep,
                  fontSize: 14,
                  lineHeight: 1,
                  fontWeight: 700,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
            {primaryDisabledForTenant && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
                className="text-admin-ink-muted"
              >
                <span aria-hidden>⚠</span>
                <span>{copy.t("Disabled in your workspace — it stays on this profile but isn't offered on your site.")}</span>
                {tenantSettingsHref ? (
                  <a
                    href={tenantSettingsHref}
                    className="underline text-admin-accent-deep"
                    style={{ fontWeight: 600 }}
                  >
                    {copy.t("Enable in Settings →")}
                  </a>
                ) : null}
              </div>
            )}
            {primaryRes.child.specialties && primaryRes.child.specialties.length > 0 && (
              <div className="mt-2.5">
                <div style={{ fontSize: 10.5, marginBottom: 4 }} className="text-admin-ink-dim">
                  {copy.t("Specialties under")} {primaryRes.child.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {primaryRes.child.specialties.map(s => {
                    const active = specialties.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => onToggleSpecialty(s)} style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                        background: active ? COLORS.indigoSoft : "#fff",
                        color: active ? COLORS.indigoDeep : COLORS.ink,
                        fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                        fontFamily: FONTS.body,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : hydrating ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "rgba(11,11,13,0.04)", border: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5, fontWeight: 500, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            <span aria-hidden style={{
              width: 8, height: 8, borderRadius: "50%",
              background: COLORS.inkDim, display: "inline-block", opacity: 0.5,
            }} />
            {copy.t("Loading current role…")}
          </div>
        ) : (
          <PrimaryTalentTypeGrid parents={allowedParents} selected={primaryType} onPick={onPickPrimary} />
        )}
      </div>
      {primaryType && (
        <div style={{
          marginTop: 14, paddingTop: 14,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 4 }} className="text-admin-ink-muted">
            {copy.t("Also bookable as")}
            {primaryRes && (
              <span style={{ marginLeft: 6, fontWeight: 500, letterSpacing: 0 }} className="text-admin-ink-dim">
                · {copy.t("within")} {shortParentLabel(primaryRes.parent)} · {copy.t("optional")}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.4 }} className="text-admin-ink-dim">
            {copy.t("Other things this person can be booked as. Pick any that apply.")}
          </div>
          <SiblingTopNPicker
            children={sameCategoryChildren}
            selected={secondaryTypes}
            onToggle={onToggleSecondary}
            parentLabel={primaryRes ? shortParentLabel(primaryRes.parent) : copy.t("this category")}
            excludeId={primaryType ?? null}
            tenantEnabledSlugs={tenantEnabledSecondarySlugs}
          />
          {otherCategories.length > 0 && (
            <div className="mt-3">
              <button type="button"
                onClick={() => setShowOtherCategories(v => !v)}
                aria-expanded={showOtherCategories}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px dashed ${COLORS.border}`, background: "transparent",
                  color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500,
                  cursor: "pointer", fontFamily: FONTS.body,
                }}>
                {showOtherCategories ? `– ${copy.t("Hide other categories")}` : `+ ${copy.t("Also bookable in another category")} (${otherCategories.length})`}
              </button>
              {showOtherCategories && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
                  {otherCategories.map(p => (
                    <div key={p.id}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink-muted">
                        <span className="mr-1">{p.emoji}</span>{shortParentLabel(p)}
                      </div>
                      <SiblingTopNPicker
                        children={p.children}
                        selected={secondaryTypes}
                        onToggle={onToggleSecondary}
                        parentLabel={shortParentLabel(p)}
                        excludeId={primaryType ?? null}
                        tenantEnabledSlugs={tenantEnabledSecondarySlugs}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {specialtyOptions.filter(g => g.typeId !== primaryType).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }} className="text-admin-ink-muted">
            {copy.t("More specialties")}
          </div>
          <div className="flex flex-col gap-2">
            {specialtyOptions.filter(g => g.typeId !== primaryType).map(g => (
              <div key={g.typeId}>
                <div style={{ fontSize: 10.5, marginBottom: 4 }} className="text-admin-ink-dim">{copy.t("Under")} {g.typeLabel}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {g.items.map(s => {
                    const active = specialties.includes(s);
                    return (
                      <button key={s} type="button" onClick={() => onToggleSpecialty(s)} style={{
                        padding: "5px 10px", borderRadius: 999,
                        border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                        background: active ? COLORS.indigoSoft : "#fff",
                        color: active ? COLORS.indigoDeep : COLORS.ink,
                        fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                        fontFamily: FONTS.body,
                      }}>{s}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Real photo gallery with file-picker, drag-reorder, crop modal ────

export type BiosEditorProps = {
  bios: LocaleBio[];
  activeLocale: LocaleCode;
  onActivateLocale: (l: LocaleCode) => void;
  onChange: (b: LocaleBio[]) => void;
  onRegenerate: () => void;
  primaryLabel?: string;
  /** Phase 2b — blanket lock when the talent owns their identity AND
   *  the relationship is not 'confirmed' exclusivity. Wraps the editor
   *  in `<fieldset disabled>` so the textarea, locale buttons,
   *  paste-clipboard and regenerate buttons are all inert. Optional;
   *  defaults to unlocked. */
  disabled?: boolean;
};

export const BiosEditor = React.memo(function BiosEditor({ bios, activeLocale, onActivateLocale, onChange, onRegenerate, primaryLabel, disabled }: BiosEditorProps) {
  const copy = useDashboardText();
  const ALL_LOCALES: LocaleCode[] = ["en", "es", "fr", "it", "pt", "de"];
  const ensureLocale = (l: LocaleCode) => {
    if (bios.some(b => b.locale === l)) return;
    onChange([...bios, { locale: l, text: "" }]);
  };
  const setText = (l: LocaleCode, t: string) =>
    onChange(bios.map(b => b.locale === l ? { ...b, text: t } : b));
  const remove = (l: LocaleCode) => {
    if (l === "en") return; // english is the canonical
    const next = bios.filter(b => b.locale !== l);
    onChange(next);
    if (activeLocale === l) onActivateLocale("en");
  };
  const active = bios.find(b => b.locale === activeLocale) ?? bios[0];
  const charCount = active?.text.length ?? 0;
  const limit = 280;

  return (
    // Phase 2b — see IdentityEditor for the rationale. `<fieldset disabled>`
    // semantically locks every form control nested below.
    <fieldset
      disabled={!!disabled}
      style={{
        border: "none",
        padding: 0,
        margin: 0,
        opacity: disabled ? 0.65 : 1,
      }}
    >
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {bios.map(b => {
          const isActive = b.locale === activeLocale;
          return (
            <button key={b.locale} type="button" onClick={() => onActivateLocale(b.locale)} style={{
              padding: "5px 11px", borderRadius: 999,
              border: `1.5px solid ${isActive ? COLORS.accent : COLORS.borderSoft}`,
              background: isActive ? "rgba(15,79,62,0.08)" : "#fff",
              color: isActive ? COLORS.accentDeep : COLORS.ink,
              fontSize: 11.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {copy.t(LOCALE_LABEL[b.locale])}
              {b.locale !== "en" && (
                <span onClick={(e) => { e.stopPropagation(); remove(b.locale); }}
                  style={{ color: COLORS.inkMuted, fontSize: 12, lineHeight: 1, fontWeight: 700, cursor: "pointer" }}>×</span>
              )}
            </button>
          );
        })}
        <select value="" onChange={(e) => { if (e.target.value) ensureLocale(e.target.value as LocaleCode); }} style={{
          padding: "5px 10px", borderRadius: 999,
          border: `1px dashed ${COLORS.border}`, background: "transparent",
          fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, cursor: "pointer",
        }}>
          <option value="">+ {copy.t("Add language")}</option>
          {ALL_LOCALES.filter(l => !bios.some(b => b.locale === l)).map(l => (
            <option key={l} value={l}>{copy.t(LOCALE_LABEL[l])}</option>
          ))}
        </select>
      </div>
      <textarea
        data-pshell-field="bio"
        value={active?.text ?? ""}
        onChange={(e) => setText(activeLocale, e.target.value)}
        placeholder={`${copy.t("Bio in")} ${copy.t(LOCALE_LABEL[activeLocale])}…`}
        rows={4}
        maxLength={limit}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px",
          borderRadius: 10, border: `1px solid ${COLORS.border}`,
          fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onRegenerate} disabled={!primaryLabel} style={{
            padding: "5px 11px", borderRadius: 999,
            background: "transparent", border: `1px dashed ${COLORS.border}`,
            color: primaryLabel ? COLORS.inkMuted : COLORS.inkDim,
            fontSize: 11, fontWeight: 500,
            cursor: primaryLabel ? "pointer" : "default",
            fontFamily: FONTS.body,
          }}>↺ {primaryLabel ? `${copy.t("Regenerate from")} ${primaryLabel}` : copy.t("Pick a Talent Type to regenerate")}</button>
          {/* Audit fix #7 — paste-from-clipboard for talent who already
              wrote a bio in another tool (Notes, Notion, Instagram bio).
              Reads navigator.clipboard, falls back silently if blocked.
              Trims to the locale's char limit so we don't blow past it. */}
          <button
            type="button"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (!text) return;
                setText(activeLocale, text.slice(0, limit));
              } catch {
                // Browser blocked — silent. Talent can paste manually.
              }
            }}
            style={{
              padding: "5px 11px", borderRadius: 999,
              background: "transparent", border: `1px dashed ${COLORS.border}`,
              color: COLORS.inkMuted,
              fontSize: 11, fontWeight: 500,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
            title={copy.t("Paste a bio you already wrote elsewhere")}
          >📋 {copy.t("Paste from clipboard")}</button>
        </div>
        <span style={{ fontSize: 10.5, color: charCount > limit * 0.9 ? COLORS.amberDeep : COLORS.inkDim }}>
          {charCount} / {limit}
        </span>
      </div>
    </div>
    </fieldset>
  );
});

// ── Rates editor ─────────────────────────────────────────────────────

export type RatesEditorProps = {
  rates: ProfileRate[];
  selectedTypeIds: string[];
  onChange: (r: ProfileRate[]) => void;
};

export const RatesEditor = React.memo(function RatesEditor({ rates, selectedTypeIds, onChange }: RatesEditorProps) {
  const copy = useDashboardText();
  if (selectedTypeIds.length === 0) {
    return (
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, fontFamily: FONTS.body, lineHeight: 1.5 }} className="bg-admin-surface text-admin-ink-muted">
        {copy.t("Pick a Talent Type in Services first. Each type gets its own rate.")}
      </div>
    );
  }

  // Ensure a row exists for each selected type
  const rateRows = selectedTypeIds.map(tid => {
    const child = findChild(tid);
    if (!child) return null;
    const cur = rates.find(r => r.typeId === tid);
    if (cur) return { ...cur, parent: child.parent, child: child.child };
    const unit = TYPE_RATE_UNIT[child.parent.id];
    return { typeId: tid, amount: 0, currency: "USD", unit, parent: child.parent, child: child.child };
  }).filter(Boolean) as (ProfileRate & { parent: TaxonomyParent; child: TaxonomyChild })[];

  const updateRow = (typeId: string, patch: Partial<ProfileRate>) => {
    const exists = rates.some(r => r.typeId === typeId);
    if (exists) {
      onChange(rates.map(r => r.typeId === typeId ? { ...r, ...patch } : r));
    } else {
      const child = findChild(typeId);
      if (!child) return;
      const unit = TYPE_RATE_UNIT[child.parent.id];
      onChange([...rates, { typeId, amount: 0, currency: "USD", unit, ...patch } as ProfileRate]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: FONTS.body }}>
      {rateRows.map(r => (
        <div key={r.typeId} style={{
          padding: 12, borderRadius: 10,
          border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span className="text-sm">{r.parent.emoji}</span>
            <span className="text-admin-ink text-admin-13 font-semibold">{r.child.label}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={r.currency} onChange={(e) => updateRow(r.typeId, { currency: e.target.value })} style={{
              padding: "9px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}>
              <option value="EUR">€ EUR</option>
              <option value="USD">$ USD</option>
              <option value="GBP">£ GBP</option>
              <option value="MXN">$ MXN</option>
            </select>
            <input type="number" min={0} value={r.amount}
              onChange={(e) => updateRow(r.typeId, { amount: Number(e.target.value) })}
              placeholder="0"
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1.5px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
                fontSize: 13, color: COLORS.ink, outline: "none",
              }}
            />
            <select value={r.unit} onChange={(e) => updateRow(r.typeId, { unit: e.target.value as RateUnit })} style={{
              padding: "9px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
              fontSize: 12.5, color: COLORS.ink, outline: "none",
            }}>
              <option value="hour">/ {copy.t("hour")}</option>
              <option value="day">/ {copy.t("day")}</option>
              <option value="set">/ {copy.t("set")}</option>
              <option value="event">/ {copy.t("event")}</option>
              <option value="session">/ {copy.t("session")}</option>
              <option value="month">/ {copy.t("month")}</option>
            </select>
          </div>
          <input type="text" value={r.conditions ?? ""}
            onChange={(e) => updateRow(r.typeId, { conditions: e.target.value })}
            placeholder={copy.t("Conditions, e.g. min 4 hours, + tax, weekend uplift")}
            style={{
              width: "100%", boxSizing: "border-box", marginTop: 6,
              padding: "8px 10px", borderRadius: 8,
              border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body,
              fontSize: 12, color: COLORS.ink, outline: "none",
            }}
          />
        </div>
      ))}
    </div>
  );
});

// ── Availability mini-grid (4 weeks) ────────────────────────────────

export function AvailabilityGrid({ cells, onToggle }: {
  cells: AvailabilityCell[];
  onToggle: (date: string) => void;
}) {
  const copy = useDashboardText();
  // Build 28 days starting from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: string; label: string; isToday: boolean }[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      isToday: i === 0,
    });
  }
  const cellMap = new Map(cells.map(c => [c.date, c.status]));

  const colorFor = (s?: AvailabilityStatus) => {
    if (s === "busy")    return { bg: COLORS.amberSoft,    fg: COLORS.amberDeep,   border: COLORS.amberDeep };
    if (s === "blocked") return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink,        border: "rgba(11,11,13,0.20)" };
    return { bg: COLORS.successSoft, fg: COLORS.successDeep, border: "transparent" };
  };

  const counts = { open: 0, busy: 0, blocked: 0 };
  days.forEach(d => {
    const s = cellMap.get(d.date) ?? "open";
    counts[s] += 1;
  });

  const dowLabels = copy.isSpanish
    ? ["D", "L", "M", "M", "J", "V", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];
  const startDow = today.getDay();

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 8 }} className="text-admin-ink-muted">
        <Legend dotColor={COLORS.green} label={`${copy.t("Available")} · ${counts.open}`} />
        <Legend dotColor={COLORS.amberDeep} label={`${copy.t("Busy")} · ${counts.busy}`} />
        <Legend dotColor="rgba(11,11,13,0.4)" label={`${copy.t("Blocked")} · ${counts.blocked}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {dowLabels.map((d, i) => (
          <div key={i} style={{
            fontSize: 9.5, fontWeight: 600, color: COLORS.inkDim, textAlign: "center", letterSpacing: 0.4,
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map(d => {
          const s = cellMap.get(d.date) ?? "open";
          const c = colorFor(s);
          return (
            <button key={d.date} type="button" onClick={() => onToggle(d.date)} style={{
              aspectRatio: "1 / 1", borderRadius: 8,
              background: c.bg,
              border: d.isToday ? `2px solid ${COLORS.accent}` : `1px solid ${c.border}`,
              color: c.fg, cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONTS.body,
            }}>{d.label}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }} className="text-admin-ink-dim">
        {copy.t("Tap a day to cycle: available → busy → blocked → available. Today is highlighted in green.")}
      </div>
    </div>
  );
}


export function Legend({ dotColor, label }: { dotColor: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
      {label}
    </span>
  );
}

// ── Verifications editor (drives trust badge) ────────────────────────

export function VerificationsEditor({ verifications, tier, onChange, isSelf }: {
  verifications: Verifications;
  tier: TrustTier;
  onChange: (v: Verifications) => void;
  isSelf: boolean;
}) {
  const copy = useDashboardText();
  const tierMeta = TALENT_TRUST_META[tier];
  const rows: { id: keyof Verifications; label: string; helper: string; readonly?: boolean }[] = [
    { id: "emailVerified",    label: copy.t("Email verified"),     helper: copy.t("We sent a confirm link.") },
    { id: "phoneVerified",    label: copy.t("Phone verified"),     helper: copy.t("SMS or call.") },
    { id: "idSubmitted",      label: copy.t("ID submitted"),       helper: copy.t("Passport or government ID. Required for Verified.") },
    { id: "payoutConnected",  label: copy.t("Payout connected"),   helper: copy.t("Bank or PSP linked. Required for Verified.") },
    { id: "hasFundedClient",  label: copy.t("Funded-account client"), helper: copy.t("At least one client on Tulala with funds on hold. Required for Gold.") },
  ];

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{
        padding: 14, borderRadius: 12,
        background: tierMeta.bg, border: `1px solid ${tierMeta.fg}30`,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tierMeta.fg, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="text-lg">{tierMeta.emoji}</span>
          {copy.t(tierMeta.label)}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {copy.t(tierMeta.helper)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ToggleControl
              value={!!verifications[r.id]}
              onChange={(v) => onChange({ ...verifications, [r.id]: v })}
              label={r.label}
            />
            <span style={{ fontSize: 11, flex: 1 }} className="text-admin-ink-dim">{r.helper}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface">
        <span className="text-admin-ink-muted text-admin-11h">
          {copy.t("Bookings completed on Tulala")}
        </span>
        <input type="number" min={0} value={verifications.bookingsCount}
          onChange={(e) => onChange({ ...verifications, bookingsCount: Number(e.target.value) })}
          disabled={isSelf}
          style={{
            width: 70, padding: "6px 10px", borderRadius: 6,
            border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink,
            textAlign: "right", outline: "none",
            opacity: isSelf ? 0.6 : 1,
          }}
        />
      </div>
      {isSelf && (
        <div style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.4 }} className="text-admin-ink-dim">
          {copy.t("Verification status is managed by Tulala. Toggle when you complete each step.")}
        </div>
      )}
    </div>
  );
}

// ── Invite-claim banner ──────────────────────────────────────────────

