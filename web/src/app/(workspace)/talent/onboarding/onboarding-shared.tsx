/**
 * Shared primitives for the talent onboarding wizard — design tokens, option
 * lists, the row types, the small field bits (FieldLabel / SaveState) and the
 * button/input styles every step reuses.
 *
 * This is a LEAF module: it imports nothing from `onboarding-steps` or
 * `TalentOnboardingWizard`, so the wizard and its steps can both depend on it
 * without an import cycle. Split out of the original single-file wizard to
 * keep each file under the 800-line lint ceiling.
 */

export const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.16)",
  surface: "rgba(24,24,27,0.03)",
  accentDeep: "#093328",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  error: "#dc2626",
  errorSoft: "#FCA5A5",
  success: "#16a34a",
  amber: "#b45309",
} as const;

export const FONT = '"Inter", system-ui, sans-serif';
export const DISPLAY = 'var(--font-cinzel), ui-serif, Georgia, serif';

export const RATE_UNITS = [
  { value: "hour", label: "per hour" },
  { value: "day", label: "per day" },
  { value: "event", label: "per event" },
  { value: "project", label: "per project" },
] as const;

export const CURRENCIES = ["USD", "EUR", "MXN", "GBP"] as const;

export const LANGUAGE_OPTIONS = [
  "English", "Spanish", "French", "Italian", "German", "Portuguese",
  "Dutch", "Russian", "Japanese", "Chinese", "Arabic", "Korean",
] as const;

export const LANGUAGE_LEVELS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "professional", label: "Professional" },
  { value: "fluent", label: "Fluent" },
  { value: "native", label: "Native" },
] as const;

// Canonical gender vocabulary — MUST stay in sync with the platform's source of
// truth: `GENDER_OPTIONS` in
// `components/admin/shell/internal/state/fixtures.ts` (the `GenderOption` union
// in `state/types.ts`), which the full profile editor uses, and the
// `identity.gender` field-engine definition whose options ARE the stored column
// values (see `lib/talent/identity-field-values-catalog.ts`). The `value` here
// is the stored value, so a talent's saved gender (e.g. "Woman") round-trips and
// displays correctly. The earlier short list (female/male/non-binary/other) did
// not match the stored vocab, so a set gender rendered as the empty placeholder.
// The leading empty entry is the unset placeholder ("Select gender" → saved as
// null via nullIfEmpty); "Prefer not to say" is a distinct, explicit choice.
export const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "Woman", label: "Woman" },
  { value: "Man", label: "Man" },
  { value: "Non-binary", label: "Non-binary" },
  { value: "Trans woman", label: "Trans woman" },
  { value: "Trans man", label: "Trans man" },
  { value: "Transgender", label: "Transgender" },
  { value: "Genderfluid", label: "Genderfluid" },
  { value: "Genderqueer", label: "Genderqueer" },
  { value: "Agender", label: "Agender" },
  { value: "Bigender", label: "Bigender" },
  { value: "Two-Spirit", label: "Two-Spirit" },
  { value: "Intersex", label: "Intersex" },
  { value: "Prefer to self-describe", label: "Prefer to self-describe" },
  { value: "Prefer not to say", label: "Prefer not to say" },
] as const;

export type RateRow = { typeId: string; amount: number; currency: string; unit: string };

export type OnboardingPrefill = {
  displayName: string;
  primaryTalentSlug: string | null;
  secondaryTalentSlugs: string[];
  homeBase: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  shortBio: string;
  ratesData: RateRow[];
};

export type ParentCategory = { id: string; slug: string; name_en: string };

// ─── Shared field bits ────────────────────────────────────────────────────────

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>{children}</label>;
}

export function SaveState({ saving, savedOk, error }: { saving: boolean; savedOk: boolean; error: string | null }) {
  if (saving) return <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 8 }}>Saving…</div>;
  if (error) return <div style={{ fontSize: 11.5, color: C.error, marginTop: 8 }}>{error}</div>;
  if (savedOk) return <div style={{ fontSize: 11.5, color: C.success, marginTop: 8 }}>Saved ✓</div>;
  return null;
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 13.5,
  color: C.ink,
  fontFamily: FONT,
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: 9,
  padding: "9px 11px",
  outline: "none",
  boxSizing: "border-box",
};

export const primaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 999,
  background: C.accent,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

export const secondaryBtn: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 999,
  background: "#fff",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: FONT,
};

export const saveBtn: React.CSSProperties = {
  marginTop: 16,
  padding: "8px 16px",
  borderRadius: 9,
  background: C.accentDeep,
  color: "#fff",
  border: "none",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};
