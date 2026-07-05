"use client";

/**
 * EmptyCanvasStarter — the minimal first-run empty state shown on EVERY empty
 * editable builder surface (the storefront homepage + inner cms_page, the
 * /t/[code] talent profile, the /t/site/[slug] talent site, and the Lab
 * playground). The edit-chrome (topbar, inspector dock, Add gallery, overlay
 * portal) mounts around this card so the operator is in "editing" from first
 * click.
 *
 * It offers two clean starting points, no heavy design grid:
 *   - a freeform "Start here" banner: clicking it opens the Add gallery (the
 *     layout / sections / elements picker) so the operator chooses how to begin,
 *     and
 *   - "Design with AI": describe the page in a line and the shared text-to-page
 *     composer assembles it from designed sections, applied through the shared
 *     undo chokepoint (requires an active EditContext).
 * The previous heavy "Start with a design" card (curated full-page design grid +
 * scratch callout) was removed at the owner's request; those designs are still
 * reachable from the Add gallery's Page Templates tab.
 *
 * Surface behaviour is config-driven, not forked:
 *   - in-editor surfaces (Lab / cms_page / talent_page / talent-site) open the
 *     shared Add gallery via `editCtx.toggleAddMenu()`, so the first insert
 *     inherits undo + autosave + adapter persistence, and
 *   - the legacy homepage mount with no EditContext falls back to the
 *     authoritative `addEmptyCanvasHeroAction` server action + starter-sync
 *     repaint (the same event handshake edit-shell / edit-context listen for).
 */

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addEmptyCanvasHeroAction } from "@/lib/site-admin/edit-mode/starter-action";
import { generateBuilderNodesAction } from "@/lib/site-admin/builder-core/ai/generate-nodes-action";

import { AIBriefInput } from "./ai-brief-input";
import { useMaybeEditContext } from "./edit-context";
import {
  starterSurfaceForKind,
  textToPageSurfaceForStarterSurface,
} from "./empty-canvas-starter-surface";

export function EmptyCanvasStarter({
  locale = "en",
}: {
  locale?: string;
} = {}) {
  const router = useRouter();
  const editCtx = useMaybeEditContext();
  // The homepage seeds + repaints via its own server action + storefront body;
  // every other surface opens the shared Add gallery through its EditContext.
  const isHomepageSurface = !editCtx || editCtx.surfaceKind === "homepage";
  const [quickInsertPending, startQuickInsert] = useTransition();
  const [quickInsertError, setQuickInsertError] = useState<string | null>(null);
  // "Design with AI" — the surface preset the text-to-page composer targets,
  // derived from the active surfaceKind (talent vs workspace), so the AI path
  // inherits the same audience split as the rest of the editor.
  const textToPageSurface = textToPageSurfaceForStarterSurface(
    editCtx ? starterSurfaceForKind(editCtx.surfaceKind) : undefined,
  );
  const [aiPending, setAiPending] = useState(false);
  // "Full page" designs the whole blank page; "Section" builds a single
  // section/block. Both emit real, editable freeform components (the AI uses the
  // component gallery); the only difference is how much it generates at once.
  const [aiMode, setAiMode] = useState<"page" | "section">("page");

  // After a homepage hero insert, wait for the storefront body to repaint in
  // place (or reload as a fallback) so the operator sees their first block
  // without a manual refresh. Mirrors the handshake edit-shell / edit-context
  // listen for on `impronta:starter-applied`.
  const requestStarterSync = useCallback(async () => {
    if (typeof window === "undefined") return;

    await new Promise<void>((resolve) => {
      let finished = false;
      let fallbackTimer: number | null = null;

      function cleanup() {
        window.removeEventListener("impronta:starter-sync-complete", onSynced);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      }
      function finish() {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      }
      function onSynced() {
        finish();
      }

      window.addEventListener("impronta:starter-sync-complete", onSynced);
      window.dispatchEvent(new CustomEvent("impronta:starter-applied"));

      fallbackTimer = window.setTimeout(() => {
        if (finished) return;
        if (editCtx) {
          void editCtx.queueRouterRefresh();
        } else {
          router.refresh();
        }
        window.location.reload();
        finish();
      }, 2000);
    });
  }, [editCtx, router]);

  // The single "Start here" action. On in-editor surfaces this opens the shared
  // Add gallery (layout / sections / elements) so the operator picks how to
  // begin; on the legacy homepage mount it inserts a hero via the server action.
  function handleStartHere() {
    setQuickInsertError(null);
    if (!isHomepageSurface && editCtx) {
      editCtx.toggleAddMenu();
      return;
    }
    startQuickInsert(async () => {
      const formData = new FormData();
      formData.set("locale", locale);
      const result = await addEmptyCanvasHeroAction(undefined, formData);
      if (!result?.ok) {
        setQuickInsertError(result?.error ?? "Couldn't add the first block.");
        return;
      }
      await requestStarterSync();
    });
  }

  // "Design with AI" — generate a full page OR a single section from a one-line
  // brief as REAL, editable freeform components, and apply it through the SAME
  // shared undo chokepoint as a template apply (snapshot + Undo toast + autosave
  // inherited on every surface). The generator returns a validated, governed
  // BuilderNode tree (server-side `validateBuilderNodeTree`); here we only
  // persist + adopt it. On the blank canvas both modes apply the whole tree.
  const handleAiCompose = useCallback(
    async (brief: string): Promise<{ ok: boolean; error?: string }> => {
      if (!editCtx) {
        return {
          ok: false,
          error: "AI needs an active editor — reload and try again.",
        };
      }
      setAiPending(true);
      try {
        const generated = await generateBuilderNodesAction({
          brief,
          scope: aiMode,
          surface: textToPageSurface,
          locale,
        });
        if (!generated.ok) {
          return {
            ok: false,
            error: generated.error ?? "Could not design that — try again.",
          };
        }
        const result = await editCtx.applyComposedTreeWithUndo({
          tree: generated.builderTree,
          label: generated.label,
        });
        if (!result.ok) {
          return {
            ok: false,
            error: result.error ?? "Could not apply the result — try again.",
          };
        }
        return { ok: true };
      } finally {
        setAiPending(false);
      }
    },
    [editCtx, aiMode, textToPageSurface, locale],
  );

  return (
    <div
      data-builder-selector-surface
      className="mx-auto my-16 w-full max-w-3xl px-6"
    >
      <button
        type="button"
        data-empty-canvas-quick-add="layout"
        disabled={quickInsertPending}
        onClick={handleStartHere}
        className="group flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-stone-300 bg-white/60 px-6 py-16 text-center transition-colors duration-200 hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors group-hover:border-stone-300 group-hover:text-stone-700">
          {quickInsertPending ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="animate-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </span>
        <span className="text-[26px] font-semibold leading-[1.1] tracking-tight text-stone-900">
          Start here
        </span>
        <span className="max-w-sm text-sm leading-relaxed text-stone-500">
          Click to choose a layout and add your first block. Nothing goes live
          until you publish.
        </span>
      </button>

      {quickInsertError ? (
        <div className="mx-auto mt-4 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
          {quickInsertError}
        </div>
      ) : null}

      {/* "Design with AI" — describe a full page or a single section and the
          generator builds it as real, editable freeform components. Requires an
          active EditContext (the legacy no-EditContext homepage mount has no
          client tree-replace path). */}
      {editCtx ? (
        <div className="mt-8">
          <div
            role="radiogroup"
            aria-label="What should AI build?"
            className="mb-3 inline-flex rounded-lg border border-stone-200 bg-white p-0.5 shadow-sm"
          >
            {(
              [
                { key: "page", label: "Full page" },
                { key: "section", label: "Section" },
              ] as const
            ).map((opt) => {
              const active = aiMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={aiPending}
                  onClick={() => setAiMode(opt.key)}
                  className={`rounded-[7px] px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-[#7c3aed] text-white shadow-sm"
                      : "text-stone-500 hover:text-stone-800"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <AIBriefInput
            onCompose={handleAiCompose}
            pending={aiPending}
            disabled={quickInsertPending}
            title={aiMode === "page" ? "Design a full page with AI" : "Build a section with AI"}
            description={
              aiMode === "page"
                ? "Describe your page and AI builds it as editable components — then make it yours."
                : "Describe one section or block and AI builds it as editable components you can refine."
            }
            placeholder={
              aiMode === "page"
                ? "e.g. a homepage for a boutique modeling agency, editorial and minimal"
                : "e.g. a services section with three cards and a booking button"
            }
          />
        </div>
      ) : null}
    </div>
  );
}
