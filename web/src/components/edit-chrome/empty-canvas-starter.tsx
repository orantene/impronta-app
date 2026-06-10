"use client";

/**
 * EmptyCanvasStarter — first-run canvas surface for tenants with no CMS
 * homepage composed.
 *
 * Implements builder-experience.html surface §18 (Empty canvas — fresh
 * tenant onboarding). Last reconciled: 2026-04-25.
 *
 * Shown only in edit mode on tenants whose homepage has zero sections. The
 * edit-chrome (topbar, inspector dock, overlay portal) still mounts around
 * this card so the operator is in "editing" from first click; they just
 * have nothing to target yet. Without this affordance, clicking Edit on a
 * fresh tenant lands them in an ambiguous state — the chrome looks ready,
 * but there's nothing on the canvas to select.
 *
 * Offers two freeform starting points without leaving edit mode:
 *   - one-click full-page designs (`applyPageDesignToHomepage`) that fill the
 *     homepage builderTree, and
 *   - "Start from scratch" which inserts a hero so the operator can build
 *     block by block via the Add Gallery / between-blocks insert paths.
 *
 * The legacy composition-slot starter recipes (`applyStarterComposition`)
 * and the section-kit Template gallery were removed when the builder went
 * freeform-only.
 */

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  addEmptyCanvasHeroAction,
} from "@/lib/site-admin/edit-mode/starter-action";
import {
  applyPageDesignToHomepage,
  type ApplyPageDesignState,
} from "@/lib/site-admin/edit-mode/page-design-apply-action";
import {
  PAGE_DESIGN_SUMMARIES,
  type PageDesignSummary,
} from "@/lib/site-admin/builder-node/page-designs/summaries";
import { pageDesignThumbnail } from "./design-thumbnails";
import { useMaybeEditContext } from "./edit-context";

/** A soft archetype-tinted gradient for each full-page design preview card. */
function archetypeGradient(archetype: PageDesignSummary["archetype"]): string {
  switch (archetype) {
    case "editorial":
      return "from-amber-50 to-stone-300";
    case "agency":
      return "from-rose-50 to-stone-300";
    case "saas":
      return "from-sky-50 to-indigo-200";
    case "store":
      return "from-stone-100 to-amber-200";
    case "festival":
      return "from-fuchsia-100 to-purple-300";
    case "studio":
      return "from-orange-50 to-amber-200";
    case "noir":
      return "from-stone-700 to-neutral-950";
    default:
      return "from-stone-50 to-stone-200";
  }
}

export function EmptyCanvasStarter({
  locale = "en",
}: {
  locale?: string;
} = {}) {
  const router = useRouter();
  const editCtx = useMaybeEditContext();
  const [designState, designDispatch, designPending] = useActionState<
    ApplyPageDesignState,
    FormData
  >(applyPageDesignToHomepage, undefined);
  const [pendingDesignId, setPendingDesignId] = useState<string | null>(null);
  const [quickInsertPending, startQuickInsert] = useTransition();
  const [quickInsertError, setQuickInsertError] = useState<string | null>(null);
  // W6-T4(b) — shown briefly after "Start from scratch" inserts the hero so the
  // operator has a clear nudge to keep building. Auto-dismissed after 8 s (or on
  // manual close) — the card unmounts once they hover a section gap and add a block.
  const [scratchMomentum, setScratchMomentum] = useState(false);
  const scratchMomentumTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // W6-T4(c) — show a brief Undo affordance after a full-page design is applied.
  // The card stays visible for up to ~2 s while the canvas syncs; the affordance
  // lives inside it so it's only ever shown during that window (not a ghost toast).
  const [showDesignUndo, setShowDesignUndo] = useState(false);

  // Cleanup the scratch-momentum auto-dismiss timer on unmount.
  useEffect(() => {
    return () => {
      if (scratchMomentumTimerRef.current !== null) {
        clearTimeout(scratchMomentumTimerRef.current);
      }
    };
  }, []);

  const requestStarterSync = useCallback(async () => {
    if (typeof window === "undefined") return;

    await new Promise<void>((resolve) => {
      let finished = false;
      let fallbackTimer: number | null = null;

      function onSynced() {
        finish();
      }

      function cleanup() {
        window.removeEventListener("impronta:starter-sync-complete", onSynced);
        if (fallbackTimer !== null) {
          window.clearTimeout(fallbackTimer);
        }
      }

      function finish() {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
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

  // A one-click full-page design fills the homepage builderTree; reuse the same
  // in-place refresh so the canvas paints the design without a manual reload.
  useEffect(() => {
    if (designState?.ok) {
      // W6-T4(c) — surface the Undo affordance while the sync is in flight.
      setShowDesignUndo(true);
      void requestStarterSync().then(() => {
        // The card is likely unmounted by now, but guard in case of fast sync.
        setShowDesignUndo(false);
      });
    }
  }, [designState, requestStarterSync]);

  function handleQuickHeroInsert() {
    setQuickInsertError(null);
    startQuickInsert(async () => {
      const formData = new FormData();
      formData.set("locale", locale);
      const result = await addEmptyCanvasHeroAction(undefined, formData);
      if (!result?.ok) {
        setQuickInsertError(result?.error ?? "Couldn't add the hero section.");
        return;
      }
      // W6-T4(b) — show the scratch-momentum nudge while the canvas syncs.
      // The banner stays visible until the user dismisses it or 8 s elapse.
      setScratchMomentum(true);
      if (scratchMomentumTimerRef.current !== null) {
        clearTimeout(scratchMomentumTimerRef.current);
      }
      scratchMomentumTimerRef.current = setTimeout(() => {
        setScratchMomentum(false);
        scratchMomentumTimerRef.current = null;
      }, 8000);
      await requestStarterSync();
    });
  }

  return (
    <div
      data-builder-selector-surface
      className="mx-auto my-16 w-full max-w-3xl px-6"
    >
      <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.25),0_2px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            New page
          </span>
          <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-tight text-stone-900">
            Start with a design.
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500">
            Pick a layout to begin — then make every word, color, and font your
            own. Nothing goes live until you publish.
          </p>
        </div>

        {quickInsertError ? (
          <div className="mx-auto mt-5 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
            {quickInsertError}
          </div>
        ) : null}

        {/* World-class full-page designs — the new 2026 starting point */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PAGE_DESIGN_SUMMARIES.map((summary) => {
            const busy = designPending && pendingDesignId === summary.id;
            // W6-T4(a) — real editorial photo per design (asset-pipeline ready;
            // falls back to the tinted gradient + placeholder bars when no photo
            // maps, so the card is never a bare gray box).
            const thumb = pageDesignThumbnail(summary.id, summary.archetype);
            return (
              <button
                key={summary.id}
                type="button"
                disabled={designPending}
                title={`Use the ${summary.label} design`}
                onClick={() => {
                  setPendingDesignId(summary.id);
                  const fd = new FormData();
                  fd.set("designId", summary.id);
                  startTransition(() => {
                    designDispatch(fd);
                  });
                }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_18px_44px_-26px_rgba(15,23,20,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div
                  className={`relative aspect-[16/10] w-full overflow-hidden border-b border-stone-100 bg-gradient-to-br ${archetypeGradient(summary.archetype)}`}
                  style={
                    thumb.src
                      ? {
                          backgroundImage: `url(${thumb.src})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600 shadow-sm ring-1 ring-stone-200/70 backdrop-blur">
                    Full page
                  </span>
                  {thumb.src ? null : (
                    <div className="absolute inset-x-5 bottom-4 flex flex-col gap-1.5 opacity-80">
                      <div className="h-1.5 w-1/3 rounded-full bg-white/70" />
                      <div className="h-6 w-full rounded-md bg-white/60" />
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="h-4 rounded bg-white/50" />
                        <div className="h-4 rounded bg-white/50" />
                        <div className="h-4 rounded bg-white/50" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-stone-900">
                      {summary.label}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
                      {summary.description}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-stone-700">
                    {busy ? "Applying…" : "Use this"}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 14 10"
                      fill="none"
                      aria-hidden
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    >
                      <path
                        d="M1 5h12M9 1l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {designState && !designState.ok ? (
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
            {designState.error}
          </div>
        ) : null}

        {/* Scratch / blank-canvas path — coaching callout (#20a) */}
        <div className="mt-8 rounded-xl border border-stone-100 bg-stone-50 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-stone-800">
                Prefer to build block by block?
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                Start with a hero and add blocks one at a time using the{" "}
                <span className="inline-flex items-center gap-0.5 rounded-sm bg-stone-200 px-1 py-0.5 font-mono text-[10px] font-semibold text-stone-700">
                  + Add block
                </span>{" "}
                line that appears between sections as you hover, or the Layers panel on the left.
              </p>
            </div>
            <button
              type="button"
              data-empty-canvas-quick-add="hero"
              disabled={quickInsertPending}
              onClick={handleQuickHeroInsert}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quickInsertPending ? (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Start from scratch
                </>
              )}
            </button>
          </div>
        </div>

        {/* W6-T4(b) — scratch momentum nudge: shown briefly after the hero is
            inserted so the operator has a clear next step instead of staring at
            a lone section. Auto-dismissed after 8 s. */}
        {scratchMomentum ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <div className="flex items-center gap-2.5 text-xs">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-emerald-600"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-emerald-900">
                <span className="font-semibold">Hero added.</span>{" "}
                Hover between sections on the canvas to add your next block — or
                use the{" "}
                <span className="font-medium">Layers</span> panel on the left.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setScratchMomentum(false)}
              aria-label="Dismiss"
              className="shrink-0 rounded-sm p-0.5 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : null}

        {/* W6-T4(c) — Undo affordance shown while the full-page design is
            syncing. The card is visible for up to ~2 s during the sync; calling
            editCtx.undo() before the canvas refreshes reverts the DB write and
            the canvas returns to the empty state. Dismissed when the sync fires
            or when the user clicks Undo. Only shown when editCtx is mounted (i.e.
            we're inside an EditProvider) and the undo stack is non-empty. */}
        {showDesignUndo && editCtx?.canUndo ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5"
          >
            <p className="text-xs text-stone-600">
              <span className="font-semibold">Design applied.</span>{" "}
              Changed your mind?
            </p>
            <button
              type="button"
              onClick={() => {
                setShowDesignUndo(false);
                void editCtx.undo();
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
              Undo
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
