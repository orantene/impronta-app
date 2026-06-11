// canonical-shadow.ts
//
// Phase 6 (P5-ζ) shadow-read scaffolding for the legacy → canonical
// reader cutover. The plan calls for adding canonical-aware sibling reads
// to 5 hot-path legacy readers (Directory card attrs, Directory facet
// filters, Directory search legacy fallback, AI-search document builder,
// AI-search debug surface) — see web/docs/phase-5-execution-runbook-validated-2026-05-19.md §P5-ζ.
//
// This module is the WIRING PRIMITIVE every reader will share: it runs a
// canonical equivalent in parallel with the legacy read, compares the two,
// and structured-logs any mismatch via `improntaLog`. The LEGACY result
// is always returned — canonical is shadow only — so adopting this helper
// is behavior-neutral today and stays that way until the flag flips.
//
// Single env flag controls shadow on/off:
//   ENGINE_CANONICAL_READ_SHADOW = "1" | "true"  → shadow ON
//   anything else (or unset)                     → shadow OFF
//
// When OFF: this helper short-circuits before the canonical query runs.
// Zero cost on hot paths — safe to wire in immediately. Adoption is
// reader-by-reader; flipping the flag is one env-var change at deploy
// time after every reader is wired.
//
// PRIVACY: mismatch logs include `readerSite` + caller-supplied metadata
// (talent_id, field_key, etc.). Values themselves are NEVER logged — only
// the shapes-don't-match signal. Callers add identifying fields via the
// `mismatchContext` option.
//
// Acceptance for the P5-ζ slice (per the runbook): mismatch rate < 0.5%
// over one production week, with `ENGINE_CANONICAL_READ_SHADOW=1` set in
// the prod env. Then the flag flips so canonical becomes primary + legacy
// becomes the shadow for one more release. The B→A write mirror
// (`mirrorWriteToLegacy`) was subsequently removed in T2.6 step 3.

import { improntaLog, type ImprontaLogFields } from "@/lib/server/structured-log";

/** Read the canonical-shadow env flag. Returns true only when explicitly
 *  enabled — any other value (unset, "0", "false", "no", etc.) is OFF. */
export function isCanonicalReadShadowEnabled(): boolean {
  const v = process.env.ENGINE_CANONICAL_READ_SHADOW;
  return v === "1" || v === "true";
}

export type CanonicalShadowResult<T> = {
  /** The result returned to the caller. Always the legacy value during
   *  the P5-ζ shadow phase. Will be the canonical value once we flip the
   *  primary, with legacy serving as shadow during the soak window. */
  result: T;
  /** The canonical-side result when shadow ran. Null when the flag is off,
   *  the canonical fn is not provided, or canonical threw. */
  canonical: T | null;
  /** Comparison outcome. Null when shadow didn't run; true when results
   *  match (per the supplied compare fn or default JSON equality); false
   *  on mismatch OR when canonical threw. */
  matched: boolean | null;
};

export type WithCanonicalShadowInput<T> = {
  /** Stable identifier for this call site (e.g. "fetch-directory-page",
   *  "ai-search-document-builder"). Appears in every mismatch log so
   *  noisy readers can be located + investigated quickly. */
  readerSite: string;
  /** The current legacy reader. Always called — its result is what we
   *  return. */
  legacy: () => Promise<T>;
  /** The canonical-equivalent reader. Called in parallel with `legacy`
   *  only when the env flag is on. Omit during early adoption to wire
   *  the call site without committing to a canonical impl yet. */
  canonical?: () => Promise<T>;
  /** Custom comparator. Default: `JSON.stringify` deep equality. Override
   *  when results are not strict-equal (e.g. row order doesn't matter,
   *  small floating-point drift is acceptable, etc.). Return true when
   *  results MATCH, false on mismatch. */
  compare?: (legacy: T, canonical: T) => boolean;
  /** Extra log fields included on mismatch (talent_id, field_key, etc.).
   *  Values themselves should NOT be put here — only identifying
   *  metadata. */
  mismatchContext?: ImprontaLogFields;
};

/** Run legacy + canonical reads, return legacy, log mismatches.
 *
 *  Always-returns-legacy contract: P5-ζ is the shadow phase. Adopting
 *  this helper in a reader is behavior-neutral until the env flag flips
 *  AND we explicitly invert the return at the call site.
 */
export async function withCanonicalShadow<T>(
  input: WithCanonicalShadowInput<T>,
): Promise<CanonicalShadowResult<T>> {
  const legacyPromise = input.legacy();

  // Shadow OFF: short-circuit, never even start the canonical fn.
  if (!isCanonicalReadShadowEnabled() || !input.canonical) {
    const result = await legacyPromise;
    return { result, canonical: null, matched: null };
  }

  // Shadow ON: race both in parallel. Canonical errors are caught
  // separately so they never bubble — the legacy result is what the
  // caller depends on.
  let canonicalResult: T | null = null;
  let canonicalThrew = false;
  const canonicalPromise = (async () => {
    try {
      canonicalResult = await input.canonical!();
    } catch (err) {
      canonicalThrew = true;
      try {
        await improntaLog("canonical-shadow.canonical_threw", {
          readerSite: input.readerSite,
          error: String(err).slice(0, 200),
          ...(input.mismatchContext ?? {}),
        });
      } catch {
        /* logging must never block the legacy read */
      }
    }
  })();

  const [legacyResult] = await Promise.all([legacyPromise, canonicalPromise]);

  if (canonicalThrew) {
    return { result: legacyResult, canonical: null, matched: false };
  }

  const compareFn = input.compare ?? defaultCompare;
  const matched = compareFn(legacyResult, canonicalResult as T);
  if (!matched) {
    try {
      await improntaLog("canonical-shadow.mismatch", {
        readerSite: input.readerSite,
        ...(input.mismatchContext ?? {}),
      });
    } catch {
      /* logging must never block the legacy read */
    }
  }
  return { result: legacyResult, canonical: canonicalResult, matched };
}

/** Default comparator. JSON-stringify equality — handles plain data shapes
 *  the engine deals with (rows, primitives, arrays). Override via the
 *  `compare` option when this is too strict (e.g. row-order doesn't
 *  matter) or too loose (e.g. floating-point comparison needs tolerance). */
function defaultCompare<T>(legacy: T, canonical: T): boolean {
  try {
    return JSON.stringify(legacy) === JSON.stringify(canonical);
  } catch {
    // Cyclic refs or non-serializable values — fall back to reference
    // equality; the mismatch log will still fire if they differ.
    return legacy === canonical;
  }
}
