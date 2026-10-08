/**
 * THEME CORE P0-3 (TUL-366): once a design is editor-authored, the DB snapshot
 * is the source of truth. Code-seed changes must NOT silently overwrite it;
 * they arrive as a reviewable Builder Lab draft (rebase authored edits onto
 * the new seed, or apply a known seed patch such as the Maison CTA).
 *
 * Pure: no I/O. Server wiring lives in `code-seed-review.server.ts`.
 */
import { isDeepStrictEqual } from "node:util";
import type { DesignPayload } from "./types";
import {
  AuthoredOverlayError,
  applyAuthoredOverlay,
  diffToOverlay,
  recoverCodeBaseFromAuthored,
  type AuthoredOverlayFile,
} from "./collection/authored/overlay";
import { isCtaAllowedSlug, stripDesignKey } from "./code-seed-cta";

export type CodeSeedRebaseOk = {
  ok: true;
  /** Authored edits replayed onto the new code seed. */
  payload: DesignPayload;
  /** Overlay used for the rebase (against baseCode). */
  overlay: AuthoredOverlayFile;
};

export type CodeSeedRebaseFail = {
  ok: false;
  code: "collision" | "unsupported";
  error: string;
};

/**
 * Replay editor-authored edits (baseCode → authored) onto newCode.
 * Strict: a kit leaf the overlay also patches refuses (AuthoredOverlayError).
 */
export function rebaseAuthoredOntoCodeSeed(input: {
  baseCode: DesignPayload;
  authored: DesignPayload;
  newCode: DesignPayload;
}): CodeSeedRebaseOk | CodeSeedRebaseFail {
  try {
    const overlay = diffToOverlay(input.baseCode, input.authored);
    const payload = applyAuthoredOverlay(input.newCode, overlay);
    return { ok: true, payload, overlay };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof AuthoredOverlayError ? "collision" : "unsupported";
    return { ok: false, code, error: msg };
  }
}

/** Find a stored payload whose hash matches the editor's `meta.code_hash`. */
export function findPayloadByCodeHash(
  candidates: ReadonlyArray<{ payload: DesignPayload; hash: string }>,
  codeHash: string,
): DesignPayload | null {
  for (const c of candidates) if (c.hash === codeHash) return c.payload;
  return null;
}

/**
 * Recover the editor's old code seed from a committed overlay when history
 * no longer has that code_hash (Folio and other overlay-only designs).
 * Removed nodes are restored from `newCode` when still present.
 * Round-trip through applyAuthoredOverlay is the acceptance check (hash of the
 * recovered canonical form may differ from the original raw seed's code_hash).
 */
export function recoverBaseCodeFromOverlay(input: {
  authored: DesignPayload;
  overlay: AuthoredOverlayFile;
  newCode: DesignPayload;
}): DesignPayload | null {
  try {
    return recoverCodeBaseFromAuthored(input.authored, input.overlay, input.newCode);
  } catch {
    return null;
  }
}

/**
 * True when an open draft's payload differs from its base snapshot (ignoring
 * props.designKey stamps). Matches the retired script's refuse guard.
 */
export function openDraftDiffersFromBase(
  draftPayload: DesignPayload,
  basePayload: DesignPayload,
): boolean {
  return !isDeepStrictEqual(stripDesignKey(draftPayload), stripDesignKey(basePayload));
}

export type CodeSeedReviewKind = "rebase" | "maison_cta" | "noop";

export type CodeSeedReviewPlan =
  | {
      ok: true;
      kind: CodeSeedReviewKind;
      /** Payload to write into the open Builder Lab draft. */
      payload: DesignPayload;
      summary: string;
      summaryEs: string;
    }
  | { ok: false; code: "collision" | "unsupported" | "refused"; error: string; errorEs: string };

/**
 * Prefer a full rebase when the editor's code base is recoverable; otherwise
 * fall through to a caller-supplied seed patch (e.g. Maison CTA).
 */
export function planCodeSeedReviewDraft(input: {
  newCode: DesignPayload;
  authored: DesignPayload;
  /** Payload at `meta.code_hash`, when a history row or overlay base is known. */
  baseCode: DesignPayload | null;
  /** Optional seed-specific patch when rebase is unavailable (Maison CTA). */
  seedPatch?: (authored: DesignPayload, newCode: DesignPayload) =>
    | { ok: true; payload: DesignPayload; alreadyDone: boolean; summary: string; summaryEs: string }
    | { ok: false; error: string; errorEs: string };
}): CodeSeedReviewPlan {
  if (input.baseCode) {
    const r = rebaseAuthoredOntoCodeSeed({
      baseCode: input.baseCode,
      authored: input.authored,
      newCode: input.newCode,
    });
    if (r.ok) {
      return {
        ok: true,
        kind: "rebase",
        payload: r.payload,
        summary: "Rebased editor edits onto the current code seed. Review the draft, then publish demos.",
        summaryEs:
          "Se reaplicaron las ediciones del editor sobre la semilla de código actual. Revisa el borrador y publica en demos.",
      };
    }
    // Leaf collision: try the seed-specific patch before refusing.
    if (!input.seedPatch) {
      return {
        ok: false,
        code: r.code,
        error: r.error,
        errorEs: "El código y el editor tocaron las mismas hojas; resuelve el conflicto en el editor.",
      };
    }
  }

  if (input.seedPatch) {
    const p = input.seedPatch(input.authored, input.newCode);
    if (!p.ok) return { ok: false, code: "refused", error: p.error, errorEs: p.errorEs };
    return {
      ok: true,
      kind: p.alreadyDone ? "noop" : "maison_cta",
      payload: p.payload,
      summary: p.summary,
      summaryEs: p.summaryEs,
    };
  }

  return {
    ok: false,
    code: "unsupported",
    error:
      "Code moved since the editor base, but that base payload is not in history. Open the draft and apply the seed change by hand, or restore a matching snapshot.",
    errorEs:
      "El código cambió desde la base del editor y esa base no está en el historial. Abre el borrador y aplica el cambio a mano, o restaura una versión con el mismo hash.",
  };
}

/**
 * Whether Factory should offer the code-seed review action.
 * True when the latest snapshot is authored and not yet reflected in code
 * (sync would skip), and either the code moved since the editor base
 * (conflict) or the design has a known seed patch (Maison CTA).
 */
export function factoryNeedsCodeSeedReview(input: {
  slug: string;
  codeDiffers: boolean;
  latestSource: string | null | undefined;
  latestMetaCodeHash: string | null | undefined;
  codeHash: string;
  overlayVersion: number;
  latestVersion: number;
}): boolean {
  if (!input.codeDiffers) return false;
  if (input.latestSource !== "authored") return false;
  if (input.overlayVersion >= input.latestVersion) return false;
  const based = input.latestMetaCodeHash;
  const conflict = typeof based === "string" && based.length > 0 && based !== input.codeHash;
  return conflict || isCtaAllowedSlug(input.slug);
}

/** Overlay file contents for `pull-authored` / Factory export after a review publish. */
export function planAuthoredOverlayExport(input: {
  authoredVersion: number;
  codeHash: string;
  payloadHash: string;
  rawCode: DesignPayload;
  authored: DesignPayload;
  priorLabelsEs?: Record<string, string>;
}): { ok: true; overlay: AuthoredOverlayFile } | { ok: false; error: string } {
  try {
    const diff = diffToOverlay(input.rawCode, input.authored);
    const overlay: AuthoredOverlayFile = {
      ...diff,
      authoredVersion: input.authoredVersion,
      codeHash: input.codeHash,
      payloadHash: input.payloadHash,
      labelsEs: input.priorLabelsEs ?? {},
    };
    // Round-trip: apply must reproduce the authored snapshot hash when possible.
    applyAuthoredOverlay(input.rawCode, overlay);
    return { ok: true, overlay };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
