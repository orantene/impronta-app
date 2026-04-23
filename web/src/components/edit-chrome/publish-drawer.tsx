"use client";

/**
 * PublishDrawer — right-side drawer for promoting the live canvas draft.
 *
 * The canvas editor saves every mutation to the draft row; "Publish" here
 * means: take the current draft composition + referenced sections, run the
 * platform publish gates (required-slot filled, every referenced section is
 * in a published state, og-image live, template schema parse), and flip
 * the page live.
 *
 * UX shape:
 *   - Opens from the top bar Publish button.
 *   - Shows a lean summary (what's about to go live, by slot) + current
 *     draft version.
 *   - Single primary action: "Publish now". Keeps it stupid-obvious.
 *   - On error, the drawer surfaces the server message inline (capability,
 *     CAS, PUBLISH_NOT_READY etc.) with a "Reload composition" escape hatch
 *     on version conflicts.
 *   - On success, the drawer flips to a confirmation state + "View live".
 *
 * This is a thinner surface than the admin composer's pre-flight modal by
 * design — the canvas operator has already been seeing the page the whole
 * time. We lean on the server gates for correctness; the drawer's job is
 * to communicate clearly, not re-invent validation.
 */

import { useEffect, useMemo, useState } from "react";

import { publishHomepageFromEditModeAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { useEditContext } from "./edit-context";

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | {
      kind: "error";
      message: string;
      code?: string;
    }
  | {
      kind: "success";
      publishedAt: string;
    };

export function PublishDrawer() {
  const {
    publishOpen,
    closePublish,
    slots,
    slotDefs,
    pageMetadata,
    pageVersion,
    dirty,
    saving,
    locale,
    refreshComposition,
  } = useEditContext();

  const [state, setState] = useState<PublishState>({ kind: "idle" });

  // Reset state whenever the drawer reopens so a second publish starts fresh.
  useEffect(() => {
    if (publishOpen) setState({ kind: "idle" });
  }, [publishOpen]);

  useEffect(() => {
    if (!publishOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && state.kind !== "publishing") closePublish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publishOpen, closePublish, state.kind]);

  const summary = useMemo(() => {
    const byDef = slotDefs.map((def) => {
      const entries = slots[def.key] ?? [];
      return {
        key: def.key,
        label: def.label,
        required: def.required,
        count: entries.length,
        missingRequired: def.required && entries.length === 0,
      };
    });
    const totalSections = byDef.reduce((sum, s) => sum + s.count, 0);
    const missing = byDef.filter((s) => s.missingRequired);
    return { byDef, totalSections, missing };
  }, [slots, slotDefs]);

  async function handlePublish() {
    if (pageVersion === null) return;
    setState({ kind: "publishing" });
    const res = await publishHomepageFromEditModeAction({
      locale,
      expectedVersion: pageVersion,
    });
    if (res.ok) {
      setState({ kind: "success", publishedAt: res.publishedAt });
      // Refresh so the canvas reflects any snapshot-backed rendering changes
      await refreshComposition();
      return;
    }
    setState({
      kind: "error",
      message: res.error,
      code: res.code,
    });
  }

  if (!publishOpen) return null;

  const publishDisabled =
    state.kind === "publishing" ||
    dirty ||
    saving ||
    summary.missing.length > 0 ||
    pageVersion === null;

  return (
    <div
      data-edit-overlay="publish-drawer-backdrop"
      className="fixed inset-0 z-[115] bg-black/20 backdrop-blur-[1px]"
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          state.kind !== "publishing"
        ) {
          closePublish();
        }
      }}
    >
      <aside
        data-edit-overlay="publish-drawer"
        className="fixed right-0 top-[52px] z-[116] flex h-[calc(100vh-52px)] w-[400px] flex-col border-l border-black/10 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 border-b border-zinc-100 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Publish
            </div>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-zinc-900">
              {state.kind === "success" ? "Live" : "Ready to publish?"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {state.kind === "success"
                ? "Your changes are now live for visitors."
                : "This will replace the live homepage with your draft."}
            </p>
          </div>
          <button
            type="button"
            onClick={closePublish}
            disabled={state.kind === "publishing"}
            className="shrink-0 rounded-md border border-transparent p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            aria-label="Close"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {state.kind === "success" ? (
          <SuccessBody publishedAt={state.publishedAt} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-700">
              {pageMetadata?.title ? (
                <div className="mb-4 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Page title
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-zinc-900">
                    {pageMetadata.title}
                  </div>
                </div>
              ) : null}

              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Structure
              </div>
              <ul className="space-y-1.5">
                {summary.byDef.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-zinc-900">
                        {s.label}
                      </div>
                      {s.required ? (
                        <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                          Required
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs tabular-nums text-zinc-500">
                      {s.count === 0 ? (
                        <span
                          className={
                            s.missingRequired
                              ? "font-medium text-amber-600"
                              : "text-zinc-400"
                          }
                        >
                          Empty
                        </span>
                      ) : (
                        <span>
                          {s.count} section{s.count === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {summary.missing.length > 0 ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Add at least one section to{" "}
                  {summary.missing.map((s, i) => (
                    <span key={s.key}>
                      <strong>{s.label}</strong>
                      {i < summary.missing.length - 1 ? ", " : ""}
                    </span>
                  ))}{" "}
                  before publishing.
                </div>
              ) : null}

              {dirty || saving ? (
                <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  {saving
                    ? "Saving your last edit…"
                    : "You have unsaved edits — wait for them to save first."}
                </div>
              ) : null}

              {state.kind === "error" ? (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {state.message}
                  {state.code === "VERSION_CONFLICT" ? (
                    <button
                      type="button"
                      onClick={() => {
                        void refreshComposition();
                        setState({ kind: "idle" });
                      }}
                      className="mt-2 block text-[11px] font-medium text-red-700 underline hover:text-red-900"
                    >
                      Reload the latest version
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3">
              <button
                type="button"
                onClick={closePublish}
                disabled={state.kind === "publishing"}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishDisabled}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state.kind === "publishing" ? (
                  <>
                    <span className="size-1.5 animate-pulse rounded-full bg-white" />
                    Publishing…
                  </>
                ) : (
                  "Publish now"
                )}
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

function SuccessBody({ publishedAt }: { publishedAt: string }) {
  const { closePublish } = useEditContext();
  const when = new Date(publishedAt);
  const relative = formatRelative(when);
  return (
    <div className="flex-1 overflow-y-auto px-5 py-6 text-sm text-zinc-700">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900">Published {relative}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Visitors will see your new homepage now. Keep editing — your next
            publish will only replace the live page when you click Publish
            again.
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={closePublish}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 30) return "just now";
  if (diff < 90) return "a minute ago";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
