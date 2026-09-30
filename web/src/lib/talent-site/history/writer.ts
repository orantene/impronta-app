/**
 * The ONE history + draft writer (theme releases Phase 2).
 *
 * - `writeSiteDraft`: an atomic draft write through the `talent_site_write_draft`
 *   RPC. CAS on `talent_sites.draft_rev` (`expectedDraftRev`), site columns,
 *   page bodies and the history entry land in one transaction; a mismatch
 *   writes nothing and returns `conflict` (the UI says "Updated in another
 *   tab · Reload", never a silent overwrite).
 * - `recordSiteHistory`: append (or fold) an entry for a writer that is not a
 *   draft write (publish) or that owns its own write path.
 *
 * Service-role only: callers prove ownership first, then pass the admin client.
 * Pure over an injected `rpc` so the unit lane drives it without a database.
 */
import { HISTORY_BATCH_SECONDS, type HistoryEntryInput } from "./types";

/** The slice of a Supabase client this module needs (injectable in tests). */
export interface HistoryRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
}

/** Site columns an atomic draft write may set. */
export interface DraftSitePatch {
  shell_tree?: unknown;
  design_tokens_draft?: Record<string, string>;
  theme_design_slug?: string | null;
  theme_design_version?: number | null;
  theme_look_slug?: string | null;
  theme_token_origin?: Record<string, string> | null;
  style_classes?: unknown;
  style_presets?: unknown;
  updated_by?: string | null;
}

/** One page body write: by id, or the home page. */
export type DraftPageWrite =
  | { id: string; patch: Record<string, unknown> }
  | { home: true; patch: Record<string, unknown> };

export interface WriteSiteDraftInput {
  siteId: string;
  /** Omit only for system writers that must not race-check (backfills). */
  expectedDraftRev?: number | null;
  site?: DraftSitePatch;
  pages?: DraftPageWrite[];
  history?: HistoryEntryInput | null;
}

export type WriteSiteDraftResult =
  | { ok: true; draftRev: number; historyId: string | null; updatedAt: string }
  | { ok: false; code: "conflict"; currentRev: number | null; error: string }
  | { ok: false; code: "site_not_found" | "page_not_found" | "error"; error: string };

/** Serialize an entry for the RPC (`p_history` / `p_entry`). */
export function historyEntryPayload(entry: HistoryEntryInput): Record<string, unknown> {
  const batch =
    entry.batchSeconds ?? (entry.kind === "edit" || entry.kind === "colors" ? HISTORY_BATCH_SECONDS : 0);
  const out: Record<string, unknown> = {
    kind: entry.kind,
    actor: entry.actor ?? "talent",
    summary_en: entry.summaryEn,
    summary_es: entry.summaryEs,
    undoable: entry.undoable ?? false,
    batch_seconds: batch,
    source: entry.source ?? "draft",
  };
  if (entry.report !== undefined) out.report = entry.report;
  if (entry.createdBy) out.created_by = entry.createdBy;
  if (entry.at) out.at = entry.at;
  if (entry.sourceRef) out.source_ref = entry.sourceRef;
  if (entry.undoOf) out.undo_of = entry.undoOf;
  if (entry.snapshot) out.snapshot_ref = entry.snapshot;
  return out;
}

const CONFLICT_ERROR = "Updated in another tab · Reload";

export async function writeSiteDraft(
  client: HistoryRpcClient,
  input: WriteSiteDraftInput,
): Promise<WriteSiteDraftResult> {
  const { data, error } = await client.rpc("talent_site_write_draft", {
    p_site_id: input.siteId,
    p_expected_rev: typeof input.expectedDraftRev === "number" ? input.expectedDraftRev : null,
    p_site: input.site ?? {},
    p_pages: input.pages ?? [],
    p_history: input.history ? historyEntryPayload(input.history) : null,
  });
  if (error) {
    if (error.code === "P0002" || /page not found/i.test(error.message)) {
      return { ok: false, code: "page_not_found", error: "Page not found." };
    }
    return { ok: false, code: "error", error: error.message };
  }
  const res = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    draft_rev?: number;
    current_rev?: number | null;
    history_id?: string | null;
    updated_at?: string;
  };
  if (res.ok && typeof res.draft_rev === "number") {
    return {
      ok: true,
      draftRev: res.draft_rev,
      historyId: res.history_id ?? null,
      updatedAt: res.updated_at ?? new Date().toISOString(),
    };
  }
  if (res.code === "conflict") {
    return {
      ok: false,
      code: "conflict",
      currentRev: typeof res.current_rev === "number" ? res.current_rev : null,
      error: CONFLICT_ERROR,
    };
  }
  if (res.code === "site_not_found") {
    return { ok: false, code: "site_not_found", error: "Site not found." };
  }
  return { ok: false, code: "error", error: "Could not save your draft." };
}

/**
 * Append a history entry without a draft write (publish, or a writer with its
 * own write path). Best-effort by design: history must never fail the write it
 * describes, so errors resolve to `null`.
 */
export async function recordSiteHistory(
  client: HistoryRpcClient,
  siteId: string,
  entry: HistoryEntryInput,
): Promise<string | null> {
  try {
    const { data, error } = await client.rpc("talent_site_history_append", {
      p_site_id: siteId,
      p_entry: historyEntryPayload(entry),
    });
    if (error) return null;
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}
