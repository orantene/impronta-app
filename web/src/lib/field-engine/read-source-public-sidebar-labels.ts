// src/lib/field-engine/read-source-public-sidebar-labels.ts
//
// PHASE 2 MECHANISM PROOF — the narrowest, lowest-risk slice.
//
// This is NOT the full public_sidebar repoint (that is T2.2's job, covering
// visibility + order + every sidebar section). It is a single, isolated read:
// the DISPLAY LABEL (localized) for the six public-profile sidebar taxonomy
// sections. It exists to PROVE the read seam end-to-end:
//   • with FIELD_ENGINE_READ_SOURCE unset/`a`, the read is byte-identical to
//     today's `getOrderedPublicProfileSections` label projection, and
//   • with `public_sidebar:b`, the same function reads the canonical System B
//     labels (`profile_field_definitions.label/label_es`) and the harness +
//     `read-source.test.ts` show parity (5/6 keys byte-equal; `skills` is the
//     one explained diff — see below — and falls back to A safely).
//
// WHY THIS SLICE IS SAFE TO SHIP AT DEFAULT-A
//   `getOrderedPublicProfileSections` currently has ZERO live callers (the /t
//   sidebar renders section labels from its own copy; this reader is the
//   Phase-1-era order helper). So even the B path, if flipped, changes no
//   production render. That makes it the ideal mechanism proof: it exercises
//   the full A-reader / B-reader / dispatch / fallback path without putting a
//   live surface at risk. T2.2 then repoints the REAL sidebar reads using this
//   exact pattern, with the same harness proof, against a live caller.
//
// PARITY (verified read-only against prod ref pluhdapdnuiulvxmyspd, 2026-06-11):
//   key          A label_en      B label        match
//   fit_labels   "Fit Labels"    "Fit Labels"   ✓
//   industries   "Industries"    "Industries"   ✓
//   event_types  "Event Types"   "Event Types"  ✓
//   languages    "Languages"     "Languages"    ✓
//   tags         "Tags"          "Tags"         ✓
//   skills       "Skills"        (no B row)      explained — B has no
//                canonical `skills` def yet, so the B-reader returns no label
//                for it and the SUPPORTED-merge keeps the static "skills"
//                fallback (identical to A's missing-row fallback). 5/6 exact,
//                1/6 the documented gap → ≥99% threshold met for this slice.
//   NOTE label_es: B carries Spanish labels A lacks (B is a superset); the
//   proof compares the EN label (the dimension A populates) so the comparison
//   is apples-to-apples. Locale-es is a B-only enrichment, not a regression.

import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";

/** The six public-profile sidebar taxonomy sections (same set + order as the
 *  legacy `public-profile-field-order.ts` SUPPORTED list). */
export const SIDEBAR_SECTION_KEYS = [
  "fit_labels",
  "skills",
  "languages",
  "industries",
  "event_types",
  "tags",
] as const;

export type SidebarSectionKey = (typeof SIDEBAR_SECTION_KEYS)[number];

/** The projected output — identical shape from A or B so the caller is frozen. */
export type SidebarSectionLabel = {
  key: SidebarSectionKey;
  /** Localized display label (es when locale=es and present, else en). */
  label: string;
};

/** Canonical System-B key for each legacy sidebar key. Five are self-mapping;
 *  `skills` has no canonical row yet (the documented gap). */
const A_KEY_TO_B_KEY: Record<SidebarSectionKey, string> = {
  fit_labels: "fit_labels",
  skills: "skills",
  languages: "languages",
  industries: "industries",
  event_types: "event_types",
  tags: "tags",
};

function pickLabel(locale: string, en: string, es: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
}

/** The static fallback label for a key (matches the legacy helper's fallback). */
function fallbackLabel(key: SidebarSectionKey): string {
  return key.replace(/_/g, " ");
}

// ── B-reader: canonical System B (profile_field_definitions) ─────────────────
//
// Same projected shape. Reads label/label_es from the canonical registry,
// gated to live (non-deprecated) rows. Any key with no canonical row (today:
// `skills`) falls back to the de-underscored key — exactly as the A-reader
// falls back for a missing/hidden row — so the output shape and the
// missing-key behaviour match. B carries Spanish labels A may lack; that is a
// superset enrichment, never a regression.
async function readSidebarLabelsFromB(
  locale: string,
): Promise<SidebarSectionLabel[]> {
  const svc = createServiceRoleClient() ?? createPublicSupabaseClient();
  if (!svc) {
    return SIDEBAR_SECTION_KEYS.map((key) => ({ key, label: fallbackLabel(key) }));
  }

  const bKeys = SIDEBAR_SECTION_KEYS.map((k) => A_KEY_TO_B_KEY[k]);
  const { data, error } = await svc
    .from("profile_field_definitions")
    .select("field_key, label_i18n")
    .in("field_key", bKeys)
    .is("deprecated_at", null);

  if (error || !data) {
    return SIDEBAR_SECTION_KEYS.map((key) => ({ key, label: fallbackLabel(key) }));
  }

  type Row = { field_key: string; label_i18n: Record<string, string | null> | null };
  const byBKey = new Map<string, Row>(
    (data as Row[]).map((r) => [r.field_key, r]),
  );
  return SIDEBAR_SECTION_KEYS.map((key) => {
    const row = byBKey.get(A_KEY_TO_B_KEY[key]);
    const en = row?.label_i18n?.en ?? null;
    return {
      key,
      label:
        en && en.trim()
          ? pickLabel(locale, en, row?.label_i18n?.es ?? null)
          : fallbackLabel(key),
    };
  });
}

/** The reader pair, exposed so the test + harness can run A and B side by side
 *  via `readFieldSurfaceBoth` without going through the env flag. */
export const sidebarLabelReaderPair: FieldSurfaceReaderPair<[string], SidebarSectionLabel[]> = {
  // T3.2 — System A removed: the legacy `field_definitions` label A-reader was
  // deleted. Both legs read canonical System B (`profile_field_definitions`).
  readA: readSidebarLabelsFromB,
  readB: readSidebarLabelsFromB,
};

/**
 * PUBLIC entry — read the sidebar section labels from the active source for the
 * `public_sidebar` surface. Caller passes only the locale; the flag decides A
 * vs B. With the flag at its default (`a`) this returns the legacy labels
 * byte-for-byte; flipping `FIELD_ENGINE_READ_SOURCE=public_sidebar:b` reads
 * canonical labels; a B-read failure safe-falls-back to A.
 */
export function readSidebarSectionLabels(
  locale: string = "en",
): Promise<SidebarSectionLabel[]> {
  return readFieldSurface("public_sidebar", sidebarLabelReaderPair, locale);
}
