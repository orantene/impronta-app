import type { TranslationHealthState, TranslationIntegrityFlag } from "@/lib/translation-center/types";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function healthMessageKey(enVal: string | undefined, esVal: string | undefined): {
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
} {
  const en = norm(enVal);
  const es = norm(esVal);
  const integrityFlags: TranslationIntegrityFlag[] = [];
  if (en && es && en === es) integrityFlags.push("identical_cross_locale");
  if (en && !es) return { health: "missing", integrityFlags };
  if (!en && es) {
    integrityFlags.push("source_missing_target_present");
    return { health: "language_issue", integrityFlags };
  }
  if (integrityFlags.length > 0) return { health: "needs_attention", integrityFlags };
  return { health: "complete", integrityFlags };
}

/** Profile field JSON `value_i18n`: primary = default locale; other `adminLocales` are targets. */
export function healthFieldValueI18n(
  primary: string | undefined,
  perTarget: Record<string, string>,
  targetLocales: string[],
): {
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
} {
  const p = norm(primary);
  const integrityFlags: TranslationIntegrityFlag[] = [];
  if (!p) {
    const anyTarget = targetLocales.some((c) => norm(perTarget[c]));
    if (anyTarget) {
      integrityFlags.push("source_missing_target_present");
      return { health: "language_issue", integrityFlags };
    }
    return { health: "missing", integrityFlags };
  }
  const missingTargets = targetLocales.filter((c) => !norm(perTarget[c]));
  if (missingTargets.length > 0) {
    return { health: "missing", integrityFlags };
  }
  const vals = [p, ...targetLocales.map((c) => norm(perTarget[c]))].filter(Boolean);
  if (vals.length >= 2 && new Set(vals).size === 1) {
    integrityFlags.push("identical_cross_locale");
    return { health: "needs_attention", integrityFlags };
  }
  if (integrityFlags.length > 0) return { health: "needs_attention", integrityFlags };
  return { health: "complete", integrityFlags };
}
