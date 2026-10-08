/**
 * THEME CORE P0-3 (TUL-366): open a Builder Lab draft that carries code-seed
 * changes for review. DB stays source of truth; no silent sync overwrite.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { loadAuthoredOverlayFile } from "./collection/authored";
import { applyAuthoredOverlay } from "./collection/authored/overlay";
import { hashBuiltinPayload } from "./sync-builtins.server";
import type { DesignPayload } from "./types";
import {
  factoryNeedsCodeSeedReview,
  findPayloadByCodeHash,
  openDraftDiffersFromBase,
  planAuthoredOverlayExport,
  planCodeSeedReviewDraft,
  recoverBaseCodeFromOverlay,
} from "./code-seed-review";
import { applyMaisonCtaSeedPatch, isCtaAllowedSlug } from "./code-seed-cta";

export { factoryNeedsCodeSeedReview };
import {
  loadThemeDraft,
  openThemeDraft,
  saveThemeDraftPayload,
} from "../theme-template/drafts.server";
import { themeTemplateEditHref } from "../theme-template/types";
import { payloadHash } from "../theme-template/publish-core";
import { decideAuthoredSync } from "./authored-sync-rule";
import { authoredOverlayVersion } from "./collection/authored";
import { loadThemeVersionPayload } from "../theme-releases/theme-versions.server";

type SnapRow = {
  version: number;
  payload: DesignPayload;
  source: string | null;
  meta: { code_hash?: unknown; payload_hash?: unknown } | null;
};

/**
 * True latest snapshot (version DESC limit 1). Never pick an older authored
 * row while a newer non-authored version sits above it — that would set
 * base_version to the new tip while building from stale payload.
 */
async function loadLatestSnapshot(
  admin: SupabaseClient,
  design: string,
): Promise<SnapRow | null> {
  const { data, error } = await admin
    .from("talent_theme_versions")
    .select("version, payload, source, meta")
    .eq("design", design)
    .order("version", { ascending: false })
    .limit(1);
  if (error) {
    logServerError("themeCatalog.codeSeedReview.history", error);
    return null;
  }
  const rows = (data ?? []) as SnapRow[];
  return rows[0] ?? null;
}

async function loadHistoryPayloads(
  admin: SupabaseClient,
  design: string,
): Promise<Array<{ payload: DesignPayload; hash: string }>> {
  const { data, error } = await admin
    .from("talent_theme_versions")
    .select("payload")
    .eq("design", design)
    .order("version", { ascending: false })
    .limit(40);
  if (error) {
    logServerError("themeCatalog.codeSeedReview.payloads", error);
    return [];
  }
  return ((data ?? []) as Array<{ payload: DesignPayload }>).map((r) => ({
    payload: r.payload,
    hash: hashBuiltinPayload(r.payload),
  }));
}

function codeEntry(slug: string) {
  return COLLECTION_DESIGNS.find((e) => e.slug === slug) ?? null;
}

function resolveBaseCode(
  slug: string,
  codeHash: string | null,
  history: Array<{ payload: DesignPayload; hash: string }>,
  newCode: DesignPayload,
  authored: DesignPayload,
): DesignPayload | null {
  if (!codeHash) return null;
  const fromHistory = findPayloadByCodeHash(history, codeHash);
  if (fromHistory) return fromHistory;
  if (hashBuiltinPayload(newCode) === codeHash) return newCode;
  const overlay = loadAuthoredOverlayFile(slug);
  if (overlay && overlay.codeHash === codeHash) {
    return recoverBaseCodeFromOverlay({
      authored,
      overlay,
      newCode,
    });
  }
  return null;
}

export type OpenCodeSeedReviewResult =
  | {
      ok: true;
      design: string;
      kind: string;
      summary: string;
      summaryEs: string;
      editHref: string;
      alreadyDone: boolean;
    }
  | { ok: false; error: string; errorEs?: string };

/**
 * Open (or refresh) the Builder Lab draft with code-seed changes for review.
 * Never publishes. Never touches talent sites.
 * Refuses when an open draft differs from its base (no silent overwrite).
 */
export async function openCodeSeedReviewDraft(
  admin: SupabaseClient,
  design: string,
  actorId: string | null,
): Promise<OpenCodeSeedReviewResult> {
  const entry = codeEntry(design);
  if (!entry) {
    return { ok: false, error: `Unknown collection design "${design}".`, errorEs: "Diseño desconocido." };
  }
  const newCode = (entry.buildPayloadRaw ?? entry.buildPayload)();
  const latest = await loadLatestSnapshot(admin, design);
  if (!latest) {
    return {
      ok: false,
      error: "No theme version found for this design.",
      errorEs: "No hay versión de tema para este diseño.",
    };
  }
  if (latest.source !== "authored") {
    return {
      ok: false,
      error:
        "Latest snapshot is not editor-authored. Use Sync catalog for a normal code-ahead draft release.",
      errorEs:
        "La última versión no es autorada en el editor. Usa Sincronizar catálogo para un lanzamiento normal.",
    };
  }
  const decision = decideAuthoredSync({
    codeHash: hashBuiltinPayload(newCode),
    latestHash: hashBuiltinPayload(latest.payload),
    latest: { version: latest.version, source: latest.source, meta: latest.meta },
    overlayVersion: authoredOverlayVersion(design),
  });
  if (decision.kind === "unchanged") {
    return {
      ok: true,
      design,
      kind: "noop",
      summary: "Code already matches the latest snapshot.",
      summaryEs: "El código ya coincide con la última versión.",
      editHref: themeTemplateEditHref(design),
      alreadyDone: true,
    };
  }
  if (decision.kind === "code_change" && !isCtaAllowedSlug(design)) {
    return {
      ok: false,
      error:
        "This design is not in an authored-pending conflict. Use Sync catalog for a normal code-ahead draft release.",
      errorEs:
        "Este diseño no está en conflicto autorado. Usa Sincronizar catálogo para un lanzamiento normal.",
    };
  }

  const codeHash =
    typeof latest.meta?.code_hash === "string" && latest.meta.code_hash.length > 0
      ? latest.meta.code_hash
      : null;
  const history = await loadHistoryPayloads(admin, design);
  const baseCode =
    decision.kind === "authored_pending"
      ? resolveBaseCode(design, codeHash, history, newCode, latest.payload)
      : null;

  const plan = planCodeSeedReviewDraft({
    newCode,
    authored: latest.payload,
    baseCode,
    seedPatch: isCtaAllowedSlug(design)
      ? (authored, code) => applyMaisonCtaSeedPatch(authored, code)
      : undefined,
  });
  if (!plan.ok) {
    return { ok: false, error: plan.error, errorEs: plan.errorEs };
  }

  const existing = await loadThemeDraft(admin, design);
  if (existing.ok) {
    if (existing.value.baseVersion !== latest.version) {
      return {
        ok: false,
        error:
          `Open draft is based on v${existing.value.baseVersion} but latest authored is v${latest.version}. ` +
          "Publish or discard the draft first.",
        errorEs:
          `El borrador abierto se basa en v${existing.value.baseVersion} pero lo autorado es v${latest.version}. ` +
          "Publica o descarta el borrador primero.",
      };
    }
    const baseAtDraft = await loadThemeVersionPayload(admin, design, existing.value.baseVersion);
    const basePayload = baseAtDraft ?? latest.payload;
    if (openDraftDiffersFromBase(existing.value.payload, basePayload)) {
      return {
        ok: false,
        error:
          `Open draft (rev ${existing.value.rev}, base v${existing.value.baseVersion}) differs from its base. ` +
          "Publish or discard it first — code-seed review will not overwrite in-progress edits.",
        errorEs:
          `El borrador abierto (rev ${existing.value.rev}, base v${existing.value.baseVersion}) difiere de su base. ` +
          "Publícalo o descártalo primero; la revisión de semilla no sobrescribe ediciones en curso.",
      };
    }
  }

  const opened = await openThemeDraft(admin, design, actorId);
  if (!opened.ok) {
    return { ok: false, error: opened.error, errorEs: "No se pudo abrir el borrador." };
  }
  if (plan.kind === "noop") {
    return {
      ok: true,
      design,
      kind: plan.kind,
      summary: plan.summary,
      summaryEs: plan.summaryEs,
      editHref: themeTemplateEditHref(design),
      alreadyDone: true,
    };
  }

  const saved = await saveThemeDraftPayload(admin, {
    design,
    payload: plan.payload,
    expectedRev: opened.value.rev,
    actorId,
  });
  if (!saved.ok) {
    return { ok: false, error: saved.error, errorEs: "No se pudo guardar el borrador." };
  }

  return {
    ok: true,
    design,
    kind: plan.kind,
    summary: plan.summary,
    summaryEs: plan.summaryEs,
    editHref: themeTemplateEditHref(design),
    alreadyDone: false,
  };
}

/**
 * Build the authored overlay JSON for git (same shape as pull-authored).
 * Refuses when the overlay would not apply cleanly to the current code seed.
 */
export async function exportAuthoredOverlayForGit(
  admin: SupabaseClient,
  design: string,
): Promise<
  | { ok: true; file: string; overlayJson: string; authoredVersion: number }
  | { ok: false; error: string }
> {
  const entry = codeEntry(design);
  if (!entry) return { ok: false, error: `Unknown design "${design}".` };
  const raw = (entry.buildPayloadRaw ?? entry.buildPayload)();
  const latest = await loadLatestSnapshot(admin, design);
  if (!latest || latest.source !== "authored") {
    return { ok: false, error: "Latest version is not editor-authored." };
  }
  const codeHash = hashBuiltinPayload(raw);
  const based =
    typeof latest.meta?.code_hash === "string" ? latest.meta.code_hash : null;
  if (based && based !== codeHash) {
    return {
      ok: false,
      error:
        "Code moved since the editor base. Open a code-seed review draft, publish it, then export again.",
    };
  }
  const expectedHash =
    typeof latest.meta?.payload_hash === "string"
      ? latest.meta.payload_hash
      : payloadHash(latest.payload);
  const prior = loadAuthoredOverlayFile(design);
  const planned = planAuthoredOverlayExport({
    authoredVersion: latest.version,
    codeHash,
    payloadHash: expectedHash,
    rawCode: raw,
    authored: latest.payload,
    priorLabelsEs: prior?.labelsEs,
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  // Verify apply hash matches stored payload hash when present.
  try {
    const applied = applyAuthoredOverlay(raw, planned.overlay);
    if (payloadHash(applied) !== expectedHash) {
      return {
        ok: false,
        error: `Overlay apply hash does not match meta.payload_hash (${expectedHash}).`,
      };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return {
    ok: true,
    file: `src/lib/talent-site/theme-catalog/collection/authored/${design}.overlay.json`,
    overlayJson: `${JSON.stringify(planned.overlay, null, 2)}\n`,
    authoredVersion: latest.version,
  };
}

/** Load draft existence helper for tests / UI. */
export async function hasOpenThemeDraft(admin: SupabaseClient, design: string): Promise<boolean> {
  const d = await loadThemeDraft(admin, design);
  return d.ok;
}
