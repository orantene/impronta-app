import "server-only";

/**
 * TEMPLATE FACTORY: "Publish as vN+1" (server side). The caller gates on
 * platform admin; everything here takes the service-role client. The checks
 * live in `publish-core.ts`; this file binds them to the database and runs
 * the one write (`publish_theme_template_draft`, atomic: catalog row,
 * snapshot, draft release, draft closed, CAS on `rev`).
 *
 * `publishAndUpdateDemos` then runs the release manager's dry run and, with
 * zero failed sites, moves the release to `demos`. It never opens the release
 * to talents (optin / default stay a separate, explicit step).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { BUILTIN_DESIGNS } from "../theme-catalog/builtins";
import { COLLECTION_DESIGNS } from "../theme-catalog/collection/designs";
import { MAISON_BUILTIN_DESIGN } from "../theme-catalog/maison/builtins";
import { hashBuiltinPayload } from "../theme-catalog/sync-builtins.server";
import type { DesignPayload } from "../theme-catalog/types";
import type { DryRunReport } from "../theme-releases/manager/dry-run";
import { changeChannel, loadRelease, runDryRun } from "../theme-releases/manager/release-manager.server";
import { releaseNotesFor } from "../theme-releases/release-notes";
import {
  planPublish,
  publishWithPorts,
  type DesignHistoryView,
  type PublishFail,
  type PublishPorts,
  type PublishResult,
  type PublishedVersion,
} from "./publish-core";
import { loadThemeDraft } from "./publish-placeholders";
import type { ReleaseItem } from "../theme-releases/types";
import type { ThemeDraftPublishPreview } from "./types";

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

async function loadHistory(admin: SupabaseClient, design: string): Promise<DesignHistoryView | null> {
  const cat = await admin
    .from("talent_theme_catalog")
    .select("title, version, payload")
    .eq("kind", "design")
    .eq("slug", design)
    .maybeSingle();
  // Throws: a failed read must never look like "no history" (that would mint a wrong version).
  if (cat.error) throw new Error(`catalog: ${cat.error.message}`);
  const snaps = await admin.from("talent_theme_versions").select("version, payload").eq("design", design);
  if (snaps.error && !(snaps.error.code && MISSING_TABLE.has(snaps.error.code))) {
    throw new Error(`snapshots: ${snaps.error.message}`);
  }
  const rels = await admin.from("talent_theme_releases").select("to_version").eq("design_slug", design);
  if (rels.error && !(rels.error.code && MISSING_TABLE.has(rels.error.code))) {
    throw new Error(`releases: ${rels.error.message}`);
  }
  const c = cat.data as { title?: string; version?: number; payload?: DesignPayload } | null;
  if (!c && (snaps.data ?? []).length === 0) return null;
  return {
    title: c?.title ?? design,
    catalog: c && typeof c.version === "number" && c.payload ? { version: c.version, payload: c.payload } : null,
    snapshots: ((snaps.data ?? []) as Array<{ version: number; payload: DesignPayload }>).filter((s) => s.payload),
    releaseToVersions: ((rels.data ?? []) as Array<{ to_version: number }>).map((r) => r.to_version),
  };
}

/** Hash of the design's code payload, so the built-in sync can tell an editor publish from a code change. */
function codeHash(design: string): string | null {
  const entry = [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS].find((e) => e.slug === design);
  if (!entry) return null;
  try {
    return hashBuiltinPayload(entry.buildPayload());
  } catch (err) {
    logServerError("themeTemplate.publish.codeHash", err);
    return null;
  }
}

export function publishPorts(admin: SupabaseClient): PublishPorts {
  return {
    loadDraft: async (design) => {
      const r = await loadThemeDraft(admin, design);
      if (r.ok) return r;
      return { ok: false, code: r.code, error: r.error, errorEs: r.code === "not_found" ? "No hay un borrador abierto para este diseño." : r.error };
    },
    loadHistory: (design) => loadHistory(admin, design),
    codeClaims: (design, version) => releaseNotesFor(design, version) !== null,
    codeHash,
    rpc: async (args) => {
      const { data, error } = await admin.rpc("publish_theme_template_draft", args as never);
      return { data, error };
    },
  };
}

function caught(err: unknown): PublishFail {
  logServerError("themeTemplate.publish", err);
  const msg = err instanceof Error ? err.message : "unexpected error";
  return { ok: false, code: "error", error: `Publish failed: ${msg}.`, errorEs: `No se pudo publicar: ${msg}.` };
}

/** No writes: what "Publish as vN+1" would ship. */
export async function previewThemeDraftPublish(
  admin: SupabaseClient,
  design: string,
): Promise<PublishResult<ThemeDraftPublishPreview & { items: ReleaseItem[] }>> {
  try {
    const plan = await planPublish(publishPorts(admin), { design, expectedRev: null });
    if (!plan.ok) return plan;
    const p = plan.value;
    return {
      ok: true,
      value: {
        nextVersion: p.nextVersion,
        itemCount: p.items.length,
        notes: { en: p.auto.notes.en, es: p.auto.notes.es },
        contentOnly: p.contentOnly,
        items: p.items,
      },
    };
  } catch (err) {
    return caught(err);
  }
}

export async function publishThemeDraft(
  admin: SupabaseClient,
  input: { design: string; expectedRev: number; actorId: string | null },
): Promise<PublishResult<PublishedVersion>> {
  try {
    const r = await publishWithPorts(publishPorts(admin), input);
    return r.ok ? { ok: true, value: { version: r.value.version, releaseId: r.value.releaseId } } : r;
  } catch (err) {
    return caught(err);
  }
}

export type PublishAndDemosResult =
  | { ok: true; value: PublishedVersion & { demosApplied: number; warnings: string[]; report: DryRunReport } }
  | (PublishFail & { releaseId?: string; version?: number; report?: DryRunReport });

/**
 * Publish, dry run, and (only with zero failed sites) "Publish to demos".
 * A failed dry run or demo update leaves the release on `draft` with its
 * report saved; the version is published either way (the returned
 * `releaseId` lets the admin fix it on the release page).
 */
export async function publishAndUpdateDemos(
  admin: SupabaseClient,
  input: { design: string; expectedRev: number; actorId: string | null },
): Promise<PublishAndDemosResult> {
  const pub = await publishThemeDraft(admin, input);
  if (!pub.ok) return pub;
  const { version, releaseId } = pub.value;
  const ref = { releaseId, version };
  try {
    const release = await loadRelease(admin, releaseId);
    if (!release) {
      return { ok: false, code: "error", error: "Published, but the release was not found.", errorEs: "Publicado, pero no se encontró la entrega.", ...ref };
    }
    const dry = await runDryRun(admin, release);
    if (!dry.ok) {
      return { ok: false, code: "error", error: `Published, but the dry run failed: ${dry.error}`, errorEs: `Publicado, pero la prueba falló: ${dry.error}`, ...ref };
    }
    const errors = dry.report.summary.errors + dry.report.summary.demos.errors;
    if (errors > 0) {
      return {
        ok: false,
        code: "invalid",
        error: `Published, but ${errors} site(s) failed the dry run. Demos were not updated.`,
        errorEs: `Publicado, pero ${errors} sitio(s) fallaron en la prueba. Los demos no se actualizaron.`,
        report: dry.report,
        ...ref,
      };
    }
    // Re-read: the guard checks the report the dry run just stored on the row.
    const fresh = await loadRelease(admin, releaseId);
    if (!fresh) {
      return { ok: false, code: "error", error: "Published, but the release was not found.", errorEs: "Publicado, pero no se encontró la entrega.", ...ref };
    }
    const moved = await changeChannel(admin, fresh, "demos");
    if (!moved.ok) {
      return {
        ok: false,
        code: "error",
        error: `Published, but demos were not updated: ${moved.error}`,
        errorEs: `Publicado, pero los demos no se actualizaron: ${moved.error}`,
        report: dry.report,
        ...ref,
      };
    }
    return { ok: true, value: { version, releaseId, demosApplied: moved.demosApplied, warnings: moved.warnings, report: dry.report } };
  } catch (err) {
    return { ...caught(err), ...ref };
  }
}
