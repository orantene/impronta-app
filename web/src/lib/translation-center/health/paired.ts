import type { TranslationHealthState, TranslationIntegrityFlag } from "@/lib/translation-center/types";
import { detectLocaleHint } from "@/lib/translation-center/save/locale-hint";

export type PairedHealthInput = {
  source: string | null;
  target: string | null;
  /** v1: no per-column timestamps — stale always false until migration adds them */
  sourceUpdatedAt: string | null;
  targetUpdatedAt: string | null;
  hasReliableTimestamps: boolean;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * Paired EN→ES style columns; target is Spanish for gap reporting.
 */
export function healthPairedColumnsEsTarget(input: PairedHealthInput): {
  health: TranslationHealthState;
  integrityFlags: TranslationIntegrityFlag[];
} {
  const src = norm(input.source);
  const tgt = norm(input.target);
  const integrityFlags: TranslationIntegrityFlag[] = [];

  if (src && tgt && src === tgt) integrityFlags.push("identical_cross_locale");
  const hintS = src ? detectLocaleHint(src) : "unknown";
  const hintT = tgt ? detectLocaleHint(tgt) : "unknown";
  if (src && hintS === "es") integrityFlags.push("source_wrong_language");
  if (tgt && hintT === "en") integrityFlags.push("target_wrong_language");
  if (!src && tgt) integrityFlags.push("source_missing_target_present");

  if (integrityFlags.includes("source_wrong_language") || integrityFlags.includes("target_wrong_language")) {
    return { health: "language_issue", integrityFlags };
  }

  if (!tgt && src) return { health: "missing", integrityFlags };
  if (!tgt && !src) return { health: "complete", integrityFlags };

  let stale = false;
  if (input.hasReliableTimestamps && input.sourceUpdatedAt && input.targetUpdatedAt && tgt) {
    stale = new Date(input.sourceUpdatedAt) > new Date(input.targetUpdatedAt);
  }
  if (stale) return { health: "needs_attention", integrityFlags };
  if (integrityFlags.includes("source_missing_target_present")) {
    return { health: "language_issue", integrityFlags };
  }
  if (integrityFlags.length > 0) return { health: "needs_attention", integrityFlags };
  return { health: "complete", integrityFlags };
}
