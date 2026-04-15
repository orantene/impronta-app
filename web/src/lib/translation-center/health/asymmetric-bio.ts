import type { TranslationHealthState, TranslationIntegrityFlag } from "@/lib/translation-center/types";
import { detectLocaleHint } from "@/lib/translation-center/save/locale-hint";

/** Live EN/ES columns only — draft/status DB columns are ignored for Translation Center health. */
export type BioHealthInput = {
  bio_en: string | null;
  short_bio: string | null;
  bio_es: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function canonicalEn(bio_en: string | null, short_bio: string | null): string {
  const a = norm(bio_en);
  if (a) return a;
  return norm(short_bio);
}

/**
 * Health for Spanish-as-target (directory / Translation Center).
 * Based only on live locale text and language/integrity hints — not legacy draft/status columns.
 */
export function healthAsymmetricBioEsTarget(input: BioHealthInput): {
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
} {
  const en = canonicalEn(input.bio_en, input.short_bio);
  const esPub = norm(input.bio_es);

  const integrityFlags: TranslationIntegrityFlag[] = [];
  if (en && esPub && en === esPub) integrityFlags.push("identical_cross_locale");

  const hintEn = en ? detectLocaleHint(en) : "unknown";
  const hintEs = esPub ? detectLocaleHint(esPub) : "unknown";
  if (en && hintEn === "es") integrityFlags.push("source_wrong_language");
  if (esPub && hintEs === "en") integrityFlags.push("target_wrong_language");
  if (esPub && hintEs === "mixed") integrityFlags.push("suspected_mixed");
  if (en && hintEn === "mixed") integrityFlags.push("suspected_mixed");
  if (!en && esPub) integrityFlags.push("source_missing_target_present");

  if (integrityFlags.includes("source_wrong_language") || integrityFlags.includes("target_wrong_language")) {
    return { health: "language_issue", integrityFlags };
  }

  if (!esPub && en) {
    return { health: "missing", integrityFlags };
  }

  if (!esPub && !en) {
    return { health: "complete", integrityFlags };
  }

  if (integrityFlags.includes("source_missing_target_present")) {
    return { health: "language_issue", integrityFlags };
  }

  if (integrityFlags.length > 0) {
    return { health: "needs_attention", integrityFlags };
  }

  return { health: "complete", integrityFlags };
}
