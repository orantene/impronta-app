"use client";

/**
 * LookImportPanel — import a PortableLook JSON, sync the built-ins into
 * `site_looks`, and flip a stored Look's status. Lives beside the gallery so
 * "export → edit → import" is one screen. No colour literals (hex ratchet).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { SiteLookRow } from "@/lib/site-admin/builder-core/site-templates/site-looks.server";

import { actionImportLook, actionSetLookStatus, actionSyncBuiltinLooks } from "./actions";

export function LookImportPanel({ rows }: { rows: SiteLookRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (work: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, okText: (d: unknown) => string) =>
    start(async () => {
      const res = await work();
      setMessage(res.ok ? okText(res.data) : res.error);
      router.refresh();
    });

  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-2">
      <form action={(fd) => run(() => actionImportLook(fd), (d) => `Imported "${(d as { slug: string }).slug}" as a draft.`)} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
        <h2 className="font-medium">Import a Look</h2>
        <p className="text-xs text-white/60">
          A <code>.look.json</code> exported from this page (or edited from one). Every page tree must pass the builder validator and the theme patch the token registry; a Look that needs repair is refused with the reasons.
        </p>
        <input type="file" name="file" accept="application/json,.json" className="text-xs" />
        <textarea name="json" rows={4} placeholder='…or paste the JSON here: {"kind":"look","version":1,…}' className="rounded border border-white/20 bg-transparent px-2 py-1 font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
            Import as draft
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => actionSyncBuiltinLooks(), (d) => { const r = d as { created: number; updated: number }; return `Synced built-ins: ${r.created} created, ${r.updated} updated.`; })} className="rounded border border-white/30 px-3 py-1.5 text-sm">
            Sync built-in Looks to the table
          </button>
        </div>
        {message ? <p className="text-xs text-white/70">{message}</p> : null}
      </form>

      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
        <h2 className="mb-2 font-medium">
          Stored Looks <span className="text-white/40">({rows.length})</span>
        </h2>
        {rows.length === 0 ? <p className="text-xs text-white/50">No rows yet. Sync the built-ins or import one.</p> : null}
        <ul className="divide-y divide-white/10 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{r.slug}</span> <span className="text-white/40">· {r.source} · v{r.version} · {r.status}</span>
              </span>
              <span className="flex gap-2">
                {r.status !== "published" ? (
                  <button type="button" disabled={pending} onClick={() => run(() => actionSetLookStatus(r.id, "published"), () => `Published ${r.slug}.`)} className="underline-offset-4 hover:underline">
                    Publish
                  </button>
                ) : null}
                {r.status !== "archived" && r.source !== "builtin" ? (
                  <button type="button" disabled={pending} onClick={() => run(() => actionSetLookStatus(r.id, "archived"), () => `Archived ${r.slug}.`)} className="text-white/60 underline-offset-4 hover:underline">
                    Archive
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
