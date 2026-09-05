"use client";

// Phase 3.12 / Roster — profile completeness dial.
//
// Computes what fraction of the 2026-vocabulary profile is filled and
// renders a circular progress + checklist. Used in the edit page sidebar
// to nudge the user toward a complete, publishable profile.

import * as React from "react";
import { createTranslator } from "@/i18n/messages";
import { type CompletenessSnapshot, computeCompleteness } from "./completeness";
import type { TalentTaxonomyAssignment, TalentLanguageRow, TalentServiceAreaRow, PortfolioMediaRow } from "./talent-data";

export type { CompletenessSnapshot };

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  card:       "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  amber:      "var(--color-admin-amber)",
  amberSoft:  "rgba(138,111,26,0.10)",
  success:    "#2E7D5B",
  successSoft:"rgba(46,125,91,0.10)",
} as const;

const F = '"Inter", system-ui, sans-serif';

const CHECKLIST: Array<{ key: keyof CompletenessSnapshot; label: string; sectionId?: string }> = [
  { key: "hasName",           label: "Display name" },
  { key: "hasPhoto",          label: "Profile photo" },
  { key: "hasPrimaryRole",    label: "Primary role (vocabulary)" },
  { key: "hasShortBio",       label: "Short bio" },
  { key: "hasHomeCity",       label: "Home city" },
  { key: "hasLanguage",       label: "At least one language" },
  { key: "hasServiceArea",    label: "Service area set" },
  { key: "hasSecondaryDepth", label: "Skills, contexts, or attributes" },
  { key: "hasPortfolio",      label: "Portfolio photo (≥1)" },
];

function score(snap: CompletenessSnapshot): { filled: number; total: number; ratio: number } {
  let filled = 0;
  for (const item of CHECKLIST) if (snap[item.key]) filled += 1;
  const total = CHECKLIST.length;
  return { filled, total, ratio: total === 0 ? 0 : filled / total };
}

function ringColor(ratio: number): { stroke: string; trackBg: string; pillBg: string; pillFg: string } {
  if (ratio >= 0.9) return { stroke: C.success, trackBg: "rgba(46,125,91,0.16)", pillBg: C.successSoft, pillFg: C.success };
  if (ratio >= 0.6) return { stroke: C.accent,  trackBg: "rgba(15,79,62,0.18)",  pillBg: C.accentSoft,  pillFg: C.accent  };
  return                    { stroke: C.amber,   trackBg: "rgba(138,111,26,0.18)", pillBg: C.amberSoft,  pillFg: C.amber   };
}

function ProgressRing({ ratio, size = 64, stroke, trackBg }: { ratio: number; size?: number; stroke: string; trackBg: string }) {
  const r = (size / 2) - 5;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - ratio);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={trackBg}
        strokeWidth={5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={5}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 360ms cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}

export function CompletenessCard({
  initial,
  taxonomy,
  languages,
  areas,
  portfolio,
  onJumpToSection,
  locale,
}: {
  initial: { display_name?: string; short_bio?: string | null; home_city_text?: string | null; photo_url?: string | null };
  taxonomy: TalentTaxonomyAssignment[];
  languages: TalentLanguageRow[];
  areas: TalentServiceAreaRow[];
  portfolio: PortfolioMediaRow[];
  onJumpToSection?: (key: keyof CompletenessSnapshot) => void;
  locale?: string;
}) {
  const t = createTranslator(locale ?? "en");
  const checklistLabels: Record<keyof CompletenessSnapshot, string> = {
    hasName:           t("admin.talent.edit.completeness.displayName"),
    hasPhoto:          t("admin.talent.edit.completeness.profilePhoto"),
    hasPrimaryRole:    t("admin.talent.edit.completeness.primaryRole"),
    hasShortBio:       t("admin.talent.edit.completeness.shortBio"),
    hasLongBio:        t("admin.talent.edit.completeness.shortBio"),
    hasHomeCity:       t("admin.talent.edit.completeness.homeCity"),
    hasLanguage:       t("admin.talent.edit.completeness.atLeastOneLanguage"),
    hasServiceArea:    t("admin.talent.edit.completeness.serviceArea"),
    hasSecondaryDepth: t("admin.talent.edit.completeness.skills"),
    hasPortfolio:      t("admin.talent.edit.completeness.portfolioPhoto"),
  };
  const snap = computeCompleteness({ initial, taxonomy, languages, areas, portfolio });
  const { filled, total, ratio } = score(snap);
  const colors = ringColor(ratio);
  const pct = Math.round(ratio * 100);

  const missing = CHECKLIST.filter((i) => !snap[i.key]);
  const done = CHECKLIST.filter((i) => snap[i.key]);

  return (
    <section style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      fontFamily: F,
    }}>
      <div style={{
        padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${C.borderSoft}`,
      }}>
        <ProgressRing ratio={ratio} stroke={colors.stroke} trackBg={colors.trackBg} />
        <div className="flex-1 min-w-0">
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.inkMuted,
            letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            {t("admin.talent.edit.completeness.title")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
            <span style={{
              fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: -0.5,
              fontVariantNumeric: "tabular-nums",
            }}>{pct}%</span>
            <span style={{
              padding: "1px 7px", borderRadius: 999,
              background: colors.pillBg, color: colors.pillFg,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            }}>
              {filled}/{total} sections
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
            {ratio >= 1
              ? t("admin.talent.edit.completeness.complete")
              : t("admin.talent.edit.completeness.incomplete").replace("{count}", String(missing.length))}
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div style={{ padding: "12px 16px", borderBottom: done.length > 0 ? `1px solid ${C.borderSoft}` : "none" }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>
            {t("admin.talent.edit.completeness.missingSectionHeader")}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {missing.map((item) => (
              <li key={item.key} style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink,
              }}>
                <span aria-hidden style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `1.5px dashed ${C.amber}`, flexShrink: 0,
                }} />
                {onJumpToSection ? (
                  <button
                    type="button"
                    onClick={() => onJumpToSection(item.key)}
                    style={{
                      flex: 1, textAlign: "left",
                      background: "transparent", border: "none",
                      padding: 0, cursor: "pointer",
                      color: C.ink, fontSize: 12.5, fontFamily: F,
                    }}
                  >
                    {checklistLabels[item.key] ?? item.label}
                  </button>
                ) : (
                  <span className="flex-1">{checklistLabels[item.key] ?? item.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {done.length > 0 && (
        <details style={{ padding: "10px 16px 12px" }}>
          <summary style={{
            cursor: "pointer", fontSize: 11, color: C.inkMuted, fontFamily: F,
            listStyle: "none",
          }}>
            <span style={{ fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" as const }}>
              {t("admin.talent.edit.completeness.doneSection").replace("{count}", String(done.length))}
            </span>
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
            {done.map((item) => (
              <li key={item.key} style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkMuted,
              }}>
                <span aria-hidden style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: C.successSoft,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5l3 3 5-7" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span className="flex-1">{checklistLabels[item.key] ?? item.label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Compact dial for inline use on roster cards / list rows.
 * Just the ring + percentage, no checklist.
 */
export function CompletenessChip({ ratio, size = 28 }: { ratio: number; size?: number }) {
  const colors = ringColor(ratio);
  const pct = Math.round(ratio * 100);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: F,
    }}>
      <ProgressRing ratio={ratio} size={size} stroke={colors.stroke} trackBg={colors.trackBg} />
      <span style={{
        fontSize: 11, fontWeight: 700, color: colors.pillFg,
        fontVariantNumeric: "tabular-nums",
      }}>
        {pct}%
      </span>
    </span>
  );
}
