"use client";

import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { PlatformPostRow } from "@/lib/cms/posts-platform-admin";

import { restorePostAction, takedownPostAction } from "./actions";

export function PostsModeration({
  rows,
  search,
  onlyHidden,
}: {
  rows: PlatformPostRow[];
  search: string;
  onlyHidden: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PlatformPostRow | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const doTakedown = () => {
    if (!confirm || !reason.trim()) return;
    const target = confirm;
    start(async () => {
      const res = await takedownPostAction({ postId: target.id, reason });
      setMessage(res.ok ? "Hidden." : res.message);
      if (res.ok) {
        setConfirm(null);
        setReason("");
      }
      router.refresh();
    });
  };

  const doRestore = (row: PlatformPostRow) => {
    setMenuId(null);
    start(async () => {
      const res = await restorePostAction({ postId: row.id });
      setMessage(res.ok ? "Restored." : res.message);
      router.refresh();
    });
  };

  return (
    <div>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-3" role="search">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search title, address, workspace or talent"
          className="min-h-10 w-full max-w-md rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40"
        />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" name="hidden" value="1" defaultChecked={onlyHidden} /> Only hidden
        </label>
        <button type="submit" className="min-h-10 rounded-lg bg-white px-4 text-sm font-medium text-black">
          Search
        </button>
      </form>
      {message ? <p className="mb-3 text-xs text-white/70">{message}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-white/50">No posts match.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => (
            <li key={r.id} className="relative flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-white/90">{r.title || "(untitled)"}</span>
                  <span className="rounded bg-white/10 px-1.5 py-px text-[10px] uppercase text-white/70">{r.status}</span>
                  {r.takenDown ? (
                    <span className="rounded bg-red-500/20 px-1.5 py-px text-[10px] uppercase text-red-200">Hidden</span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-white/50">
                  {r.ownerName ?? "Unknown owner"} · {r.ownerKind === "workspace" ? "Workspace" : "Talent"} · /{r.slug} · {r.locale}
                </div>
                {r.takenDown && r.takenDownReason ? (
                  <div className="truncate text-xs text-red-200/80">Reason: {r.takenDownReason}</div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Actions"
                aria-haspopup="menu"
                aria-expanded={menuId === r.id}
                disabled={pending}
                onClick={() => setMenuId(menuId === r.id ? null : r.id)}
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-transparent text-white/80"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuId === r.id ? (
                <div role="menu" className="absolute right-3 top-12 z-20 min-w-[200px] rounded-lg border border-white/15 bg-neutral-900 p-1 shadow-xl">
                  {r.takenDown ? (
                    <button type="button" role="menuitem" onClick={() => doRestore(r)} className="block w-full cursor-pointer rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm text-white hover:bg-white/10">
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuId(null);
                        setReason("");
                        setConfirm(r);
                      }}
                      className="block w-full cursor-pointer rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm text-red-200 hover:bg-white/10"
                    >
                      Hide (takedown)
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="takedown-title" className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 p-5">
            <h2 id="takedown-title" className="m-0 text-lg font-semibold text-white">
              Hide this post?
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {confirm.title || "(untitled)"} · {confirm.ownerName ?? "Unknown owner"}. The owner will see your reason.
            </p>
            <label htmlFor="takedown-reason" className="mt-4 block text-xs text-white/60">
              Reason (required)
            </label>
            <textarea
              id="takedown-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 p-2 text-sm text-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="min-h-10 cursor-pointer rounded-lg border border-white/20 bg-transparent px-4 text-sm text-white">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={doTakedown}
                className="min-h-10 cursor-pointer rounded-lg border-0 bg-red-300 px-4 text-sm font-semibold text-black disabled:cursor-default disabled:opacity-40"
              >
                Hide post
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
