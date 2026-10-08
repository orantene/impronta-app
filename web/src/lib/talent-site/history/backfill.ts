/**
 * Backfill mapping (pure): existing revision rows → history entries.
 *
 * Sources:
 * - `talent_site_revisions`: shell checkpoints (`surface: talent_site_shell`,
 *   draft or published) and Maison design versions (`surface: maison_design`,
 *   published). Full-site composition snapshots carry no freeform tree and are
 *   skipped.
 * - `talent_page_revisions`: the autosave trigger's rows, folded per page into
 *   one entry per 60 s window (the same batching the live writer uses).
 *
 * Every entry carries `sourceRef` so a re-run is a no-op (unique per site).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { HISTORY_BATCH_SECONDS, type HistoryEntryInput, type HistorySnapshot } from "./types";

export interface SiteRevisionRow {
  id: string;
  kind: string;
  created_at: string;
  created_by: string | null;
  snapshot: unknown;
}

export interface PageRevisionRow {
  id: string;
  page_id: string;
  created_at: string;
  created_by: string | null;
  blocks: unknown;
}

const tree = (v: unknown): BuilderNode[] | null => (Array.isArray(v) ? (v as BuilderNode[]) : null);

function tokens(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
}

export function mapSiteRevision(
  row: SiteRevisionRow,
  homePageId: string | null,
): HistoryEntryInput | null {
  const snap = (row.snapshot ?? {}) as Record<string, unknown>;
  const published = row.kind === "published";
  if (snap.surface === "talent_site_shell") {
    const shell = tree(snap.builderTree);
    if (!shell) return null;
    const snapshot: HistorySnapshot = { v: 1, source: published ? "published" : "draft", shell };
    return {
      kind: published ? "publish" : "edit",
      actor: "talent",
      summaryEn: published ? "Published header and footer" : "Edited header and footer",
      summaryEs: published ? "Publicaste el encabezado y el pie" : "Editaste el encabezado y el pie",
      at: row.created_at,
      createdBy: row.created_by,
      sourceRef: `talent_site_revisions:${row.id}`,
      batchSeconds: 0,
      snapshot,
    };
  }
  if (snap.surface === "maison_design") {
    const snapshot: HistorySnapshot = {
      v: 1,
      source: "published",
      shell: tree(snap.shell_published),
      tokens: tokens(snap.design_tokens),
      design: {
        slug: typeof snap.design_slug === "string" ? snap.design_slug : null,
        look: typeof snap.look_slug === "string" ? snap.look_slug : null,
      },
      pages: homePageId && tree(snap.home_blocks) ? { [homePageId]: tree(snap.home_blocks) } : {},
    };
    return {
      kind: "publish",
      actor: "talent",
      summaryEn: "Published your site",
      summaryEs: "Publicaste tu sitio",
      at: typeof snap.published_at === "string" ? snap.published_at : row.created_at,
      createdBy: row.created_by,
      sourceRef: `talent_site_revisions:${row.id}`,
      batchSeconds: 0,
      snapshot,
    };
  }
  return null;
}

/**
 * Fold page autosave rows into one entry per page per window. Rows hold the
 * body a save REPLACED, so each entry is "a version of <page> saved then".
 * The newest row of a window wins. `limitPerPage` keeps the newest windows.
 */
export function mapPageRevisions(
  rows: ReadonlyArray<PageRevisionRow>,
  titles: ReadonlyMap<string, string>,
  opts: { windowSeconds?: number; limitPerPage?: number } = {},
): HistoryEntryInput[] {
  const windowMs = (opts.windowSeconds ?? HISTORY_BATCH_SECONDS) * 1000;
  const limit = opts.limitPerPage ?? 50;
  const byPage = new Map<string, PageRevisionRow[]>();
  for (const r of rows) {
    if (!tree(r.blocks)) continue;
    const list = byPage.get(r.page_id) ?? [];
    list.push(r);
    byPage.set(r.page_id, list);
  }
  const out: HistoryEntryInput[] = [];
  for (const [pageId, list] of byPage) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const windows: PageRevisionRow[] = [];
    let start = -Infinity;
    for (const r of list) {
      const t = new Date(r.created_at).getTime();
      if (t - start > windowMs || windows.length === 0) {
        windows.push(r);
        start = t;
      } else {
        windows[windows.length - 1] = r;
      }
    }
    const title = titles.get(pageId)?.trim() || "a page";
    const titleEs = titles.get(pageId)?.trim() || "una página";
    for (const r of windows.slice(-limit)) {
      out.push({
        kind: "edit",
        actor: "talent",
        summaryEn: `Saved version of ${title}`,
        summaryEs: `Versión guardada de ${titleEs}`,
        at: r.created_at,
        createdBy: r.created_by,
        sourceRef: `talent_page_revisions:${r.id}`,
        batchSeconds: 0,
        snapshot: { v: 1, source: "draft", pages: { [pageId]: tree(r.blocks) } },
      });
    }
  }
  return out.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}
