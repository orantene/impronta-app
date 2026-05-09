"use client";

// Phase 3.12 / Roster — talent-edit page section components.
//
// Each section is a self-contained client component that calls server
// actions in extended-actions.ts and re-renders via router.refresh().
// Designed to compose under TalentEditForm.

import React, { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTranslator } from "@/i18n/messages";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  TaxonomyTermPick,
  TalentTaxonomyAssignment,
  TalentLanguageRow,
  TalentServiceAreaRow,
  PortfolioMediaRow,
} from "./talent-data";
import {
  addTalentTaxonomyTerm,
  removeTalentTaxonomyTerm,
  addTalentLanguage,
  updateTalentLanguage,
  removeTalentLanguage,
  addTalentServiceArea,
  removeTalentServiceArea,
  registerPortfolioPhoto,
  removePortfolioPhoto,
  removeTalentFromRoster,
} from "./extended-actions";

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  card:       "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.10)",
  coralDeep:  "#8C3318",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
  success:    "#2E7D5B",
  successSoft:"rgba(46,125,91,0.10)",
} as const;

const F  = '"Inter", system-ui, sans-serif';

function inputStyle(): React.CSSProperties {
  return {
    fontFamily: F, fontSize: 13, color: C.ink,
    border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "8px 10px", background: C.card,
    outline: "none", boxSizing: "border-box", width: "100%",
  };
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 8,
    background: C.accent, color: "#fff", border: "none",
    fontSize: 12.5, fontWeight: 700, cursor: disabled ? "default" : "pointer",
    fontFamily: F, opacity: disabled ? 0.5 : 1,
  };
}
function btnDanger(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 12px", borderRadius: 8,
    background: C.coralSoft, color: C.coralDeep,
    border: `1px solid ${C.coralDeep}`,
    fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    fontFamily: F, opacity: disabled ? 0.5 : 1,
  };
}

function SectionCard({
  title, subtitle, action, children,
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 0, fontFamily: F,
    }}>
      <div style={{
        padding: "14px 18px",
        borderBottom: `1px solid ${C.borderSoft}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{
            fontFamily: F, fontSize: 14, fontWeight: 700, color: C.ink,
            margin: 0, letterSpacing: -0.05,
          }}>{title}</h3>
          {subtitle && (
            <p style={{ fontSize: 11.5, color: C.inkMuted, margin: "3px 0 0", lineHeight: 1.4 }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

// ─── Taxonomy editor ──────────────────────────────────────────────────────────

const RELATIONSHIP_BUCKETS: Array<{
  key: string;
  label: string;
  acceptTermTypes: string[];
  description: string;
}> = [
  { key: "primary_role",   label: "Primary role",  acceptTermTypes: ["parent_category","primary_role","role"], description: "The main category clients book this talent for." },
  { key: "secondary_role", label: "Other roles",   acceptTermTypes: ["parent_category","primary_role","role","sub_category"], description: "Additional categories this talent is bookable for." },
  { key: "skill",          label: "Skills",        acceptTermTypes: ["skill","skill_group"], description: "Specific talents and disciplines." },
  { key: "context",        label: "Best for",      acceptTermTypes: ["context","context_group"], description: "Event types and contexts where this talent shines." },
  { key: "attribute",      label: "Attributes",    acceptTermTypes: ["attribute"], description: "Look, location, language, vibe markers." },
];

function TermChip({
  label,
  parent,
  pending,
  onRemove,
}: {
  label: string;
  parent?: string | null;
  pending: boolean;
  onRemove: () => void;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 4px 4px 10px",
      borderRadius: 999, background: C.surface,
      border: `1px solid ${C.border}`,
      fontSize: 11.5, fontWeight: 500, color: C.ink,
      fontFamily: F, opacity: pending ? 0.5 : 1, transition: "opacity 100ms",
      lineHeight: 1.2,
    }}>
      {parent && (
        <span style={{ color: C.inkDim, fontWeight: 500 }}>{parent} ›</span>
      )}
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        aria-label="Remove"
        style={{
          width: 16, height: 16, borderRadius: "50%",
          background: "rgba(11,11,13,0.08)", color: C.inkMuted,
          border: "none", cursor: pending ? "default" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: 0, marginLeft: 2,
        }}
      >
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </button>
    </span>
  );
}

function TaxonomyBucketEditor({
  tenantSlug, talentId, bucketKey, bucketLabel, bucketDescription,
  acceptTermTypes, allTerms, currentAssignments,
  isPrimary, t,
}: {
  tenantSlug: string;
  talentId: string;
  bucketKey: string;
  bucketLabel: string;
  bucketDescription: string;
  acceptTermTypes: string[];
  allTerms: TaxonomyTermPick[];
  currentAssignments: TalentTaxonomyAssignment[];
  isPrimary: boolean;
  t: (key: string) => string;
}) {
  const router = useRouter();
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  const [, startMutation] = useTransition();
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");

  const eligibleTerms = useMemo(() => {
    const taken = new Set(currentAssignments.map((a) => a.termId));
    return allTerms
      .filter((t) => acceptTermTypes.includes(t.termType))
      .filter((t) => !taken.has(t.id));
  }, [allTerms, acceptTermTypes, currentAssignments]);

  const filteredEligible = useMemo(() => {
    if (!search.trim()) return eligibleTerms.slice(0, 80);
    const q = search.toLowerCase();
    return eligibleTerms.filter((t) =>
      (t.nameEn + " " + t.slug + " " + (t.parentNameEn ?? "")).toLowerCase().includes(q),
    ).slice(0, 80);
  }, [eligibleTerms, search]);

  const handleAdd = useCallback((termId: string) => {
    setPendingTerm(termId);
    startMutation(async () => {
      await addTalentTaxonomyTerm(tenantSlug, talentId, termId, bucketKey);
      router.refresh();
      setPendingTerm(null);
      if (isPrimary) setPicker(false);
      setSearch("");
    });
  }, [tenantSlug, talentId, bucketKey, isPrimary, router]);

  const handleRemove = useCallback((termId: string) => {
    setPendingTerm(termId);
    startMutation(async () => {
      await removeTalentTaxonomyTerm(tenantSlug, talentId, termId, bucketKey);
      router.refresh();
      setPendingTerm(null);
    });
  }, [tenantSlug, talentId, bucketKey, router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h4 style={{
          fontSize: 12, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: 0.05,
        }}>{bucketLabel}</h4>
        <span style={{ fontSize: 11, color: C.inkMuted }}>
          ({currentAssignments.length}{isPrimary ? "/1" : ""})
        </span>
        <span style={{ flex: 1 }} />
        {(!isPrimary || currentAssignments.length === 0) && (
          <button
            type="button"
            onClick={() => setPicker(!picker)}
            style={{
              padding: "3px 9px", borderRadius: 7,
              background: picker ? C.accent : C.accentSoft,
              color: picker ? "#fff" : C.accent,
              border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700, fontFamily: F,
            }}
          >
            {picker ? t("admin.talent.edit.taxonomy.doneBtn") : t("admin.talent.edit.taxonomy.addBtn")}
          </button>
        )}
      </div>
      {bucketDescription && (
        <p style={{ fontSize: 11.5, color: C.inkMuted, margin: 0, lineHeight: 1.4 }}>
          {bucketDescription}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {currentAssignments.length === 0 ? (
          <span style={{ fontSize: 12, color: C.inkDim, fontStyle: "italic" }}>{t("admin.talent.edit.taxonomy.emptyState")}</span>
        ) : currentAssignments.map((a) => (
          <TermChip
            key={a.termId}
            label={a.termNameEn}
            parent={a.parentNameEn}
            pending={pendingTerm === a.termId}
            onRemove={() => handleRemove(a.termId)}
          />
        ))}
      </div>

      {picker && (
        <div style={{
          marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10,
          background: C.surface,
        }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <input
              type="text"
              autoFocus
              placeholder={t("admin.talent.edit.taxonomy.searchPlaceholder").replace("{bucketLabel}", bucketLabel.toLowerCase())}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle(), padding: "6px 10px", fontSize: 12.5, background: C.card }}
            />
          </div>
          <div style={{
            maxHeight: 240, overflowY: "auto",
            display: "flex", flexDirection: "column",
          }}>
            {filteredEligible.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: C.inkMuted, textAlign: "center" }}>
                {search.trim() ? t("admin.talent.edit.taxonomy.noMatches").replace("{search}", search) : t("admin.talent.edit.taxonomy.noMore")}
              </div>
            ) : filteredEligible.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleAdd(t.id)}
                disabled={pendingTerm === t.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 12px", textAlign: "left",
                  border: "none", borderBottom: `1px solid ${C.borderSoft}`,
                  background: "transparent", cursor: "pointer",
                  fontFamily: F, fontSize: 12.5, color: C.ink,
                  opacity: pendingTerm === t.id ? 0.5 : 1,
                }}
              >
                {t.parentNameEn && (
                  <span style={{ color: C.inkDim, fontWeight: 500 }}>
                    {t.parentNameEn} ›
                  </span>
                )}
                <span style={{ fontWeight: 600 }}>{t.nameEn}</span>
                <span style={{ flex: 1 }} />
                <span style={{
                  fontSize: 9.5, color: C.inkDim,
                  textTransform: "uppercase" as const, letterSpacing: 0.4,
                }}>
                  {t.termType.replace(/_/g, " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaxonomySection({
  tenantSlug, talentId, allTerms, currentAssignments, locale,
}: {
  tenantSlug: string;
  talentId: string;
  allTerms: TaxonomyTermPick[];
  currentAssignments: TalentTaxonomyAssignment[];
  locale: string;
}) {
  const t = createTranslator(locale);
  const bucketMeta: Record<string, { label: string; description: string }> = {
    primary_role:   { label: t("admin.talent.edit.taxonomy.buckets.primaryRole"),   description: t("admin.talent.edit.taxonomy.buckets.primaryRoleDesc") },
    secondary_role: { label: t("admin.talent.edit.taxonomy.buckets.otherRoles"),    description: t("admin.talent.edit.taxonomy.buckets.otherRolesDesc") },
    skill:          { label: t("admin.talent.edit.taxonomy.buckets.skills"),         description: t("admin.talent.edit.taxonomy.buckets.skillsDesc") },
    context:        { label: t("admin.talent.edit.taxonomy.buckets.bestFor"),        description: t("admin.talent.edit.taxonomy.buckets.bestForDesc") },
    attribute:      { label: t("admin.talent.edit.taxonomy.buckets.attributes"),     description: t("admin.talent.edit.taxonomy.buckets.attributesDesc") },
  };
  return (
    <SectionCard
      title={t("admin.talent.edit.taxonomy.title")}
      subtitle={t("admin.talent.edit.taxonomy.subtitle")}
    >
      {RELATIONSHIP_BUCKETS.map((b) => {
        const meta = bucketMeta[b.key] ?? { label: b.label, description: b.description };
        return (
          <TaxonomyBucketEditor
            key={b.key}
            tenantSlug={tenantSlug}
            talentId={talentId}
            bucketKey={b.key}
            bucketLabel={meta.label}
            bucketDescription={meta.description}
            acceptTermTypes={b.acceptTermTypes}
            allTerms={allTerms}
            currentAssignments={currentAssignments.filter((a) => a.relationshipType === b.key)}
            isPrimary={b.key === "primary_role"}
            t={t}
          />
        );
      })}
    </SectionCard>
  );
}

// ─── Languages editor ─────────────────────────────────────────────────────────

const COMMON_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Mandarin Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
];

const SPEAKING_LEVELS = [
  { value: "beginner",     label: "Beginner" },
  { value: "conversational", label: "Conversational" },
  { value: "fluent",       label: "Fluent" },
  { value: "native",       label: "Native" },
];

export function LanguagesSection({
  tenantSlug, talentId, languages, locale,
}: {
  tenantSlug: string;
  talentId: string;
  languages: TalentLanguageRow[];
  locale: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startMutation] = useTransition();
  const [picker, setPicker] = useState(false);
  const [pickCode, setPickCode] = useState("en");
  const [pickName, setPickName] = useState("English");
  const [pickLevel, setPickLevel] = useState("fluent");
  const [pickNative, setPickNative] = useState(false);

  const taken = useMemo(() => new Set(languages.map((l) => l.languageCode)), [languages]);
  const available = COMMON_LANGUAGES.filter((l) => !taken.has(l.code));

  const handleAdd = useCallback(() => {
    if (!pickCode || !pickName) return;
    startMutation(async () => {
      await addTalentLanguage(tenantSlug, talentId, {
        languageCode: pickCode,
        languageName: pickName,
        speakingLevel: pickLevel,
        isNative: pickNative,
      });
      router.refresh();
      setPicker(false);
    });
  }, [tenantSlug, talentId, pickCode, pickName, pickLevel, pickNative, router]);

  const handleUpdate = useCallback((id: string, patch: Parameters<typeof updateTalentLanguage>[3]) => {
    setPendingId(id);
    startMutation(async () => {
      await updateTalentLanguage(tenantSlug, talentId, id, patch);
      router.refresh();
      setPendingId(null);
    });
  }, [tenantSlug, talentId, router]);

  const handleRemove = useCallback((id: string) => {
    setPendingId(id);
    startMutation(async () => {
      await removeTalentLanguage(tenantSlug, talentId, id);
      router.refresh();
      setPendingId(null);
    });
  }, [tenantSlug, talentId, router]);

  return (
    <SectionCard
      title={t("admin.talent.edit.languages.title")}
      subtitle={t("admin.talent.edit.languages.subtitle")}
      action={
        <button
          type="button"
          onClick={() => setPicker(!picker)}
          style={btnPrimary(false)}
        >
          {picker ? t("admin.talent.edit.languages.cancelBtn") : t("admin.talent.edit.languages.addBtn")}
        </button>
      }
    >
      {picker && available.length > 0 && (
        <div style={{
          marginBottom: 14, padding: 12,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          display: "grid", gap: 8,
          gridTemplateColumns: "1fr 1fr 1fr auto",
        }}>
          <select
            value={pickCode}
            onChange={(e) => {
              const code = e.target.value;
              const meta = COMMON_LANGUAGES.find((l) => l.code === code);
              setPickCode(code);
              if (meta) setPickName(meta.name);
            }}
            style={inputStyle()}
          >
            {available.map((l) => (
              <option key={l.code} value={l.code}>
                {t(`admin.talent.edit.languages.names.${l.code === "zh" ? "mandarin" : l.code === "ar" ? "arabic" : l.name.toLowerCase().split(" ")[0]}`) || l.name}
              </option>
            ))}
          </select>
          <select value={pickLevel} onChange={(e) => setPickLevel(e.target.value)} style={inputStyle()}>
            {SPEAKING_LEVELS.map((lv) => (
              <option key={lv.value} value={lv.value}>
                {t(`admin.talent.edit.languages.proficiency.${lv.value}`)}
              </option>
            ))}
          </select>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12.5, color: C.ink, fontFamily: F,
          }}>
            <input type="checkbox" checked={pickNative} onChange={(e) => setPickNative(e.target.checked)} />
            {t("admin.talent.edit.languages.nativeSpeaker")}
          </label>
          <button type="button" onClick={handleAdd} style={btnPrimary(false)}>{t("admin.talent.edit.languages.addBtn").replace("+ ", "")}</button>
        </div>
      )}
      {languages.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.inkMuted, fontStyle: "italic" }}>
          {t("admin.talent.edit.languages.emptyState")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {languages.map((lang) => (
            <div key={lang.id} style={{
              display: "grid",
              gridTemplateColumns: "minmax(120px, 1fr) 160px 1fr auto",
              gap: 10, alignItems: "center",
              padding: "8px 10px", borderRadius: 10,
              background: C.surface, border: `1px solid ${C.borderSoft}`,
              opacity: pendingId === lang.id ? 0.5 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 11, color: C.inkDim, textTransform: "uppercase",
                }}>{lang.languageCode}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  {lang.languageName}
                </span>
                {lang.isNative && (
                  <span style={{
                    padding: "1px 6px", borderRadius: 999,
                    background: C.successSoft, color: C.success,
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}>{t("admin.talent.edit.languages.nativeBadge")}</span>
                )}
              </div>
              <select
                value={lang.speakingLevel ?? "fluent"}
                onChange={(e) => handleUpdate(lang.id, { speakingLevel: e.target.value })}
                style={{ ...inputStyle(), padding: "5px 8px", fontSize: 12 }}
              >
                {SPEAKING_LEVELS.map((lv) => (
                  <option key={lv.value} value={lv.value}>
                    {t(`admin.talent.edit.languages.proficiency.${lv.value}`)}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "canHost", labelKey: "host", val: lang.canHost },
                  { key: "canSell", labelKey: "sell", val: lang.canSell },
                  { key: "canTranslate", labelKey: "translate", val: lang.canTranslate },
                  { key: "canTeach", labelKey: "teach", val: lang.canTeach },
                ].map((b) => (
                  <label key={b.key} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, fontFamily: F,
                    padding: "2px 6px", borderRadius: 6,
                    background: b.val ? C.accentSoft : "transparent",
                    color: b.val ? C.accent : C.inkMuted,
                    fontWeight: b.val ? 600 : 500,
                  }}>
                    <input
                      type="checkbox"
                      checked={b.val}
                      onChange={(e) => handleUpdate(lang.id, { [b.key]: e.target.checked })}
                      style={{ width: 12, height: 12 }}
                    />
                    {t(`admin.talent.edit.languages.capabilities.${b.labelKey}`)}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(lang.id)}
                disabled={pendingId === lang.id}
                aria-label="Remove language"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.inkMuted, cursor: "pointer", padding: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Service areas editor ────────────────────────────────────────────────────

const SERVICE_KINDS = [
  { value: "home_base",            label: "Home base",          desc: "Primary city. One per talent." },
  { value: "frequent",             label: "Frequent",           desc: "Cities where they regularly work." },
  { value: "occasional",           label: "Occasional",         desc: "Available with notice." },
  { value: "available_for_travel", label: "Travel friendly",    desc: "Will travel for the right gig." },
];

export function ServiceAreasSection({
  tenantSlug, talentId, areas, locale,
}: {
  tenantSlug: string;
  talentId: string;
  areas: TalentServiceAreaRow[];
  locale: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startMutation] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draftKind, setDraftKind] = useState("frequent");
  const [draftCity, setDraftCity] = useState("");
  const [draftRadius, setDraftRadius] = useState("");
  const [draftFee, setDraftFee] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");

  const handleAdd = useCallback(() => {
    if (!draftCity.trim()) {
      alert("Add a city name.");
      return;
    }
    startMutation(async () => {
      await addTalentServiceArea(tenantSlug, talentId, {
        serviceKind: draftKind,
        city: draftCity.trim(),
        travelRadiusKm: draftRadius ? Number(draftRadius) : undefined,
        travelFeeRequired: draftFee,
        notes: draftNotes.trim() || undefined,
      });
      router.refresh();
      setAdding(false);
      setDraftKind("frequent");
      setDraftCity("");
      setDraftRadius("");
      setDraftFee(false);
      setDraftNotes("");
    });
  }, [tenantSlug, talentId, draftKind, draftCity, draftRadius, draftFee, draftNotes, router]);

  const handleRemove = useCallback((id: string) => {
    setPendingId(id);
    startMutation(async () => {
      await removeTalentServiceArea(tenantSlug, talentId, id);
      router.refresh();
      setPendingId(null);
    });
  }, [tenantSlug, talentId, router]);

  return (
    <SectionCard
      title={t("admin.talent.edit.serviceAreas.title")}
      subtitle={t("admin.talent.edit.serviceAreas.subtitle")}
      action={
        <button type="button" onClick={() => setAdding(!adding)} style={btnPrimary(false)}>
          {adding ? t("admin.talent.edit.serviceAreas.cancelBtn") : t("admin.talent.edit.serviceAreas.addBtn")}
        </button>
      }
    >
      {adding && (
        <div style={{
          marginBottom: 14, padding: 12,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          display: "grid", gap: 8,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 130px", gap: 8 }}>
            <select value={draftKind} onChange={(e) => setDraftKind(e.target.value)} style={inputStyle()}>
              {SERVICE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(`admin.talent.edit.serviceAreas.kinds.${k.value === "available_for_travel" ? "travelFriendly" : k.value === "home_base" ? "homeBase" : k.value}`)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("admin.talent.edit.serviceAreas.cityPlaceholder")}
              value={draftCity}
              onChange={(e) => setDraftCity(e.target.value)}
              style={inputStyle()}
            />
            <input
              type="number"
              placeholder={t("admin.talent.edit.serviceAreas.radiusPlaceholder")}
              value={draftRadius}
              onChange={(e) => setDraftRadius(e.target.value)}
              style={inputStyle()}
            />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.ink }}>
              <input type="checkbox" checked={draftFee} onChange={(e) => setDraftFee(e.target.checked)} />
              {t("admin.talent.edit.serviceAreas.travelFee")}
            </label>
            <input
              placeholder={t("admin.talent.edit.serviceAreas.notesPlaceholder")}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              style={{ ...inputStyle(), flex: 1, minWidth: 180 }}
            />
            <button type="button" onClick={handleAdd} style={btnPrimary(false)}>{t("admin.talent.edit.languages.addBtn").replace("+ ", "")}</button>
          </div>
        </div>
      )}
      {areas.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.inkMuted, fontStyle: "italic" }}>
          {t("admin.talent.edit.serviceAreas.emptyState")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {areas.map((a) => {
            const kindMeta = SERVICE_KINDS.find((k) => k.value === a.serviceKind);
            return (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: C.surface, border: `1px solid ${C.borderSoft}`,
                opacity: pendingId === a.id ? 0.5 : 1,
              }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: a.serviceKind === "home_base" ? C.successSoft : C.accentSoft,
                  color: a.serviceKind === "home_base" ? C.success : C.accent,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase", flexShrink: 0,
                }}>
                  {kindMeta ? t(`admin.talent.edit.serviceAreas.kinds.${kindMeta.value === "available_for_travel" ? "travelFriendly" : kindMeta.value === "home_base" ? "homeBase" : kindMeta.value}`) : a.serviceKind}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flex: 1 }}>
                  {a.city ?? "—"}
                </span>
                {a.travelRadiusKm != null && (
                  <span style={{ fontSize: 11.5, color: C.inkMuted }}>
                    {a.travelRadiusKm} km
                  </span>
                )}
                {a.travelFeeRequired && (
                  <span style={{
                    padding: "1px 7px", borderRadius: 999,
                    background: C.amberSoft, color: C.amber,
                    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}>{t("admin.talent.edit.serviceAreas.feeBadge")}</span>
                )}
                {a.notes && (
                  <span style={{ fontSize: 11.5, color: C.inkMuted, fontStyle: "italic" }}>
                    {a.notes}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  disabled={pendingId === a.id}
                  aria-label="Remove area"
                  style={{
                    width: 26, height: 26, borderRadius: 7,
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: C.inkMuted, cursor: "pointer", padding: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Portfolio gallery ───────────────────────────────────────────────────────

export function GallerySection({
  tenantSlug, talentId, portfolio, locale,
}: {
  tenantSlug: string;
  talentId: string;
  portfolio: PortfolioMediaRow[];
  locale: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number>(0); // count of in-flight uploads
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Filter to portfolio (gallery) variants only — card photo lives separately.
  const galleryItems = portfolio.filter((p) => p.variantKind === "portfolio" || p.variantKind === "gallery");

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading((u) => u + files.length);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Storage client unavailable.");
      setUploading(0);
      return;
    }

    for (const file of Array.from(files)) {
      try {
        if (!file.type.startsWith("image/")) {
          setError(t("admin.talent.edit.gallery.errorNotImage").replace("{name}", file.name));
          setUploading((u) => Math.max(0, u - 1));
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          setError(t("admin.talent.edit.gallery.errorTooLarge").replace("{name}", file.name));
          setUploading((u) => Math.max(0, u - 1));
          continue;
        }
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
        const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
        const storagePath = `${talentId}/gallery/${crypto.randomUUID()}.${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from("media-public")
          .upload(storagePath, file, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          });
        if (upErr) {
          setError(t("admin.talent.edit.gallery.errorUploadFailed").replace("{name}", file.name).replace("{message}", upErr.message));
          setUploading((u) => Math.max(0, u - 1));
          continue;
        }

        // Read intrinsic dimensions for a nicer grid (best-effort).
        const dim = await readImageDimensions(file).catch(() => null);

        const reg = await registerPortfolioPhoto(tenantSlug, talentId, {
          storagePath,
          width: dim?.width,
          height: dim?.height,
          fileSize: file.size,
          mimeType: file.type,
        });
        if (!reg.ok) {
          setError(t("admin.talent.edit.gallery.errorRegisterFailed").replace("{name}", file.name).replace("{message}", reg.error ?? ""));
        }
      } finally {
        setUploading((u) => Math.max(0, u - 1));
      }
    }
    router.refresh();
    if (fileInput.current) fileInput.current.value = "";
  }, [tenantSlug, talentId, router]);

  const handleRemove = useCallback((id: string) => {
    if (!confirm(t("admin.talent.edit.gallery.deleteConfirm"))) return;
    setPendingId(id);
    void (async () => {
      await removePortfolioPhoto(tenantSlug, talentId, id);
      router.refresh();
      setPendingId(null);
    })();
  }, [tenantSlug, talentId, router]);

  return (
    <SectionCard
      title={`${t("admin.talent.edit.gallery.titleLabel")} (${galleryItems.length})`}
      subtitle={t("admin.talent.edit.gallery.subtitle")}
      action={
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading > 0}
            style={btnPrimary(uploading > 0)}
          >
            {uploading > 0 ? `${t("admin.talent.edit.gallery.uploadBtn").replace("+ ", "")} ${uploading}…` : t("admin.talent.edit.gallery.uploadBtn")}
          </button>
        </>
      }
    >
      {error && (
        <div style={{
          padding: "8px 12px", marginBottom: 10,
          background: C.coralSoft, color: C.coralDeep,
          border: `1px solid ${C.coralDeep}`, borderRadius: 8,
          fontSize: 12, fontFamily: F,
        }}>{error}</div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
          minHeight: 100,
          padding: galleryItems.length === 0 ? 24 : 0,
          border: galleryItems.length === 0 ? `2px dashed ${C.border}` : "none",
          borderRadius: 12,
          alignItems: "center", justifyContent: "center",
        }}
      >
        {galleryItems.length === 0 ? (
          <div style={{
            gridColumn: "1 / -1",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            color: C.inkMuted, fontFamily: F,
          }}>
            <div style={{ fontSize: 28, opacity: 0.5 }}>🖼</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("admin.talent.edit.gallery.emptyTitle")}</div>
            <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.5, textAlign: "center", maxWidth: 320 }}>
              {t("admin.talent.edit.gallery.emptyMessage")}
            </div>
          </div>
        ) : galleryItems.map((p) => (
          <div key={p.id} style={{
            position: "relative",
            borderRadius: 10, overflow: "hidden",
            background: C.surface, border: `1px solid ${C.borderSoft}`,
            aspectRatio: "1 / 1",
            opacity: pendingId === p.id ? 0.4 : 1,
            transition: "opacity 120ms",
          }}>
            <img
              src={p.publicUrl}
              alt="Portfolio"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <button
              type="button"
              onClick={() => handleRemove(p.id)}
              disabled={pendingId === p.id}
              aria-label="Delete photo"
              style={{
                position: "absolute", top: 6, right: 6,
                width: 26, height: 26, borderRadius: 8,
                background: "rgba(11,11,13,0.65)", color: "#fff",
                border: "none", cursor: "pointer", padding: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(4px)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// Read image natural dimensions without uploading. Returns {width,height}.
async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

// ─── Delete-talent button ─────────────────────────────────────────────────────

export function DeleteTalentButton({
  tenantSlug, talentId, talentName, locale,
}: { tenantSlug: string; talentId: string; talentName: string; locale: string }) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [busy, startMutation] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    const sure = confirm(
      t("admin.talent.edit.delete.confirmMsg").replace("{name}", talentName),
    );
    if (!sure) return;
    setError(null);
    startMutation(async () => {
      const res = await removeTalentFromRoster(tenantSlug, talentId);
      if (res && res.ok === false) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }, [tenantSlug, talentId, talentName, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" onClick={handleClick} disabled={busy} style={btnDanger(busy)}>
        {busy ? t("admin.talent.edit.delete.removingBtn") : t("admin.talent.edit.delete.btn")}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: C.coralDeep, fontFamily: F }}>{error}</span>
      )}
    </div>
  );
}
