"use client";

/**
 * Phase 7 (M-19) — admin composer for non-homepage pages, list view.
 *
 * Sits inside the page-settings drawer's "Templates" tab (or wherever
 * mounted). Lists all composable pages for the tenant — homepage on top
 * for orientation, then non-homepage rows. Each row shows draft / live
 * slot counts, snapshot status, and a "Publish current draft" button
 * that bakes the draft composition into `published_page_snapshot` for
 * the public reader to consume.
 *
 * Full inline composition for non-homepage pages will reuse the existing
 * EditShell once it learns to bind to a per-page id; until then this
 * surface unblocks the snapshot flow so operators can publish pages
 * whose draft slot rows already exist (created via the API or directly).
 */

import { useEffect, useState, useTransition, type ReactElement } from "react";

import {
  listComposablePages,
  publishPageSnapshot,
  type ComposablePageRow,
} from "@/lib/site-admin/edit-mode/page-composer-action";

export function PagesComposerList(): ReactElement {
  const [rows, setRows] = useState<ReadonlyArray<ComposablePageRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    setError(null);
    const r = await listComposablePages();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRows(r.pages);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function handlePublish(row: ComposablePageRow) {
    if (!confirm(`Publish ${row.draftSlotCount} draft section(s) to "${row.title}"?`)) {
      return;
    }
    startTransition(async () => {
      const r = await publishPageSnapshot({
        pageId: row.id,
        expectedVersion: row.version,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInfo(`Published ${r.sectionCount} sections to ${row.title}.`);
      await refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      {rows === null ? (
        <div className="text-muted-foreground">Loading pages…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-muted-foreground">
          No pages on this tenant yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((p) => {
            const isHomepage = p.isHomepage;
            const slug = p.slug ? `/${p.slug}` : "/";
            const canPublish = !isHomepage && p.draftSlotCount > 0;
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background p-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {p.title}
                    </span>
                    {isHomepage ? (
                      <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                        Homepage
                      </span>
                    ) : null}
                    <span className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      {p.status}
                    </span>
                    {p.hasSnapshot ? (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Snapshot
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {slug} · draft {p.draftSlotCount} / live {p.liveSlotCount}
                    {p.publishedAt ? ` · last published ${new Date(p.publishedAt).toLocaleDateString()}` : ""}
                  </span>
                </div>
                {!isHomepage ? (
                  <a
                    href={`${slug}?edit=1`}
                    className="rounded-md border border-border/60 px-2 py-1 text-[10px] hover:bg-muted/50"
                    title="Open the page in edit mode"
                  >
                    Open
                  </a>
                ) : null}
                {canPublish ? (
                  <button
                    type="button"
                    onClick={() => handlePublish(p)}
                    disabled={pending}
                    className="rounded-md border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Publish draft
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
          {info}
        </div>
      ) : null}
    </div>
  );
}
