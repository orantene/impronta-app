"use client";

/**
 * PublishDrawer — right-side drawer for promoting the live canvas draft.
 *
 * Built on the shared `ResizableDrawer` primitive so the operator can
 * expand (normal → expanded → fullscreen) or free-drag the left edge to
 * any width. That matters here because the "What goes live" list can
 * grow tall on composed pages, and the operator occasionally wants the
 * whole viewport to scan the diff without a scroll crutch.
 *
 * The canvas editor saves every mutation to the draft row; "Publish"
 * resolves the referenced-section publish dependency itself (see
 * `publishHomepageFromEditModeAction`) and flips the page live in one
 * operator action — no "publish the section first" chore.
 *
 * UX shape:
 *   - Opens from the top bar Publish button.
 *   - Lean summary (what's about to go live, by slot) + current draft
 *     version.
 *   - Single primary action: "Publish now". Stupid-obvious.
 *   - On error, the drawer surfaces the server message inline with a
 *     "Reload composition" escape hatch on version conflicts.
 *   - On success, flips to a confirmation state + Close.
 */

import { useEffect, useMemo, useState } from "react";

import { publishHomepageFromEditModeAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { ResizableDrawer } from "@/components/ui/resizable-drawer";
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

  useEffect(() => {
    if (publishOpen) setState({ kind: "idle" });
  }, [publishOpen]);

  const summary = useMemo(() => {
    const byDef = slotDefs.map((def) => {
      const entries = slots[def.key] ?? [];
      return {
        key: def.key,
        label: def.label,
        required: def.required,
        count: entries.length,
        // Section names in slot order — shows the operator exactly what's
        // going live, not just "3 sections". Truncated in render so long
        // names don't break the drawer layout.
        names: entries.map((e) => e.name),
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
      await refreshComposition();
      return;
    }
    setState({
      kind: "error",
      message: res.error,
      code: res.code,
    });
  }

  const publishDisabled =
    state.kind === "publishing" ||
    dirty ||
    saving ||
    summary.missing.length > 0 ||
    pageVersion === null;

  const header = (
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
  );

  const body = state.kind === "success" ? (
    <SuccessBody publishedAt={state.publishedAt} onClose={closePublish} />
  ) : (
    <div className="px-5 py-4 text-sm text-zinc-700">
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

      <div className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>What goes live</span>
        <span className="text-zinc-400 tabular-nums">
          {summary.totalSections} section
          {summary.totalSections === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {summary.byDef.map((s) => (
          <li
            key={s.key}
            className="rounded-md border border-zinc-100 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-[13px] font-medium text-zinc-900">
                {s.label}
              </div>
              <div className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-400 tabular-nums">
                {s.missingRequired ? (
                  <span className="font-medium text-amber-600">Required</span>
                ) : s.count === 0 ? (
                  "Empty"
                ) : (
                  `${s.count}`
                )}
              </div>
            </div>
            {s.names.length > 0 ? (
              <div className="mt-1 truncate text-[11px] text-zinc-500">
                {s.names.join(" · ")}
              </div>
            ) : null}
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
  );

  const footer = state.kind === "success" ? null : (
    <div className="flex items-center justify-between gap-2">
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
    </div>
  );

  return (
    <ResizableDrawer
      open={publishOpen}
      onClose={closePublish}
      preventClose={state.kind === "publishing"}
      header={header}
      body={body}
      footer={footer}
      overlayKey="publish-drawer"
      ariaLabel="Publish homepage"
    />
  );
}

function SuccessBody({
  publishedAt,
  onClose,
}: {
  publishedAt: string;
  onClose: () => void;
}) {
  const when = new Date(publishedAt);
  const relative = formatRelative(when);
  return (
    <div className="px-5 py-6 text-sm text-zinc-700">
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
          <p className="text-sm font-medium text-zinc-900">
            Published {relative}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Visitors see the new homepage now. Keep editing — your next
            publish only replaces the live page when you click Publish again.
          </p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
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
