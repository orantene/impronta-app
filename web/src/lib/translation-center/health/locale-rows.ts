import type { TranslationHealthState, TranslationIntegrityFlag } from "@/lib/translation-center/types";
import { detectLocaleHint } from "@/lib/translation-center/save/locale-hint";

export type LocaleRowPairInput = {
  primaryLocaleValue: string | null;
  fallbackLocaleValue: string | null;
  primaryUpdatedAt: string | null;
  fallbackUpdatedAt: string | null;
  /** v1 optional stale: peer primary newer than fallback field */
  enablePeerStale: boolean;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * CMS-style: request "target" is one locale row field vs peer locale same field.
 */
export function healthLocaleRowField(input: LocaleRowPairInput): {
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
} {
  const primary = norm(input.primaryLocaleValue);
  const fallback = norm(input.fallbackLocaleValue);
  const integrityFlags: TranslationIntegrityFlag[] = [];

  if (primary && fallback && primary === fallback) integrityFlags.push("identical_cross_locale");
  const hP = primary ? detectLocaleHint(primary) : "unknown";
  if (primary && hP === "en") integrityFlags.push("target_wrong_language");
  if (primary && hP === "mixed") integrityFlags.push("suspected_mixed");

  if (!primary && fallback) {
    return { health: "missing", integrityFlags };
  }
  if (!primary && !fallback) {
    return { health: "complete", integrityFlags };
  }

  let stale = false;
  if (
    input.enablePeerStale &&
    primary &&
    fallback &&
    input.fallbackUpdatedAt &&
    input.primaryUpdatedAt
  ) {
    stale = new Date(input.primaryUpdatedAt) > new Date(input.fallbackUpdatedAt);
  }
  if (integrityFlags.includes("target_wrong_language")) {
    return { health: "language_issue", integrityFlags };
  }
  if (stale) return { health: "needs_attention", integrityFlags };
  if (integrityFlags.length > 0) return { health: "needs_attention", integrityFlags };
  return { health: "complete", integrityFlags };
}
