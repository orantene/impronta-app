"use client";

/**
 * EmptyCanvasStarter — the shared, surface-parameterized first-run picker shown
 * on EVERY empty editable builder surface (ONB-1).
 *
 * Implements builder-experience.html surface §18 (Empty canvas — fresh
 * onboarding). Last reconciled: 2026-06-17.
 *
 * Shown in edit mode whenever the active surface's builderTree is empty — the
 * storefront homepage AND inner cms_page, the /t/[code] talent profile, the
 * /t/site/[slug] talent site (home + inner pages), and the Lab playground.
 * Previously this card was homepage-only and the other surfaces fell off a
 * blank-page cliff (an `InEditorEmptyCanvas` stub that just opened the Add
 * Gallery). The edit-chrome (topbar, inspector dock, overlay portal) mounts
 * around this card so the operator is in "editing" from first click.
 *
 * Surface-parameterized, NOT forked: the ONLY per-surface difference is which
 * starter set is offered, resolved from the EditContext `surfaceKind` (a config
 * value) via `starterSurfaceForKind` / `starterSummariesForSurface` — single-
 * subject talent surfaces see talent + generic designs; agency/workspace
 * surfaces see workspace + generic designs; the homepage (no explicit surface)
 * keeps the full set. There is no `surfaceKind === ...` branch in the render or
 * apply path; a fifth surface inherits the picker by mapping its kind once.
 *
 * Offers two freeform starting points without leaving edit mode:
 *   - one-click full-page designs that fill the active surface's builderTree via
 *     the shared `applyPageDesignWithUndo` chokepoint (snapshot + Undo toast +
 *     autosave inherited on every surface; the homepage keeps its authoritative
 *     server action, every other surface persists through its own adapter), and
 *   - "Start from scratch" which inserts a hero so the operator can build block
 *     by block via the Add Gallery / between-blocks insert paths.
 *
 * The legacy composition-slot starter recipes (`applyStarterComposition`)
 * and the section-kit Template gallery were removed when the builder went
 * freeform-only.
 */

import {
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
import {
  type EmptyCanvasStarterSurface,
  starterSurfaceForKind,
  starterSummariesForSurface,
  textToPageSurfaceForStarterSurface,
} from "./empty-canvas-starter-surface";
import { AIBriefInput } from "./ai-brief-input";
import { composePageFromBriefAction } from "@/lib/site-admin/builder-core/ai/text-to-page-action";

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
  surface,
}: {
  locale?: string;
  /**
   * Which audience's starter set to offer. When omitted, it is derived from the
   * EditContext `surfaceKind` (config-driven, not a render branch). Callers pass
   * it explicitly only to disambiguate the two `talent_page`-kind surfaces:
   * `'talent'` for the /t/[code] profile vs `'talent-site'` for the /t/site page.
   * Left undefined on the legacy homepage mount with no EditContext, the full
   * design set is shown (historical behavior preserved).
   */
  surface?: EmptyCanvasStarterSurface;
} = {}) {
  const router = useRouter();
  const editCtx = useMaybeEditContext();
  // Resolve the effective starter surface from the explicit prop or the active
  // surfaceKind (a config value). `undefined` only when there is no EditContext
  // AND no prop — the legacy homepage mount, which keeps the full design set.
  const effectiveSurface: EmptyCanvasStarterSurface | undefined =
    surface ??
    (editCtx ? starterSurfaceForKind(editCtx.surfaceKind) : undefined);
  const starterSummaries = starterSummariesForSurface(
    PAGE_DESIGN_SUMMARIES,
    effectiveSurface,
  );
  // The homepage seeds + repaints via its own server action + storefront body;
  // every other surface persists + repaints through the shared EditContext
  // adapter path. `homepage` (or no EditContext = legacy homepage mount) keeps
  // the server-action / starter-sync path.
  const isHomepageSurface = !editCtx || editCtx.surfaceKind === "homepage";
  const [designError, setDesignError] = useState<string | null>(null);
  const [pendingDesignId, setPendingDesignId] = useState<string | null>(null);
  const [designApplyPending, startDesignApply] = useTransition();
  const [quickInsertPending, startQuickInsert] = useTransition();
  const [quickInsertError, setQuickInsertError] = useState<string | null>(null);
  // W6-T4(b) — shown briefly after "Start from scratch" inserts the hero so the
  // operator has a clear nudge to keep building. Auto-dismissed after 8 s (or on
  // manual close) — the card unmounts once they hover a section gap and add a block.
  const [scratchMomentum, setScratchMomentum] = useState(false);
  const scratchMomentumTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AI-1 — the surface context the text-to-page composer uses to pick the right
  // preset audience. Derived from the SAME resolved starter surface (no extra
  // surfaceKind read), so the AI path inherits the talent/workspace split.
  const textToPageSurface = textToPageSurfaceForStarterSurface(effectiveSurface);
  const [aiPending, setAiPending] = useState(false);

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

  // ONB-1 / CANVAS-4 — a one-click full-page design fills the ACTIVE surface's
  // builderTree. The apply routes through the SHARED `applyPageDesignWithUndo`
  // chokepoint on the EditContext, so the pre-apply tree is snapshotted onto the
  // undo stack and the shared "Template applied — Undo?" toast appears
  // (identical on every surface). The chokepoint chooses the persist target by
  // surface capability — NOT a branch here:
  //   - homepage uses its authoritative server action (`homepageApply` below),
  //     which sets `seedCuratedDesign` so the Free-plan on-ramp keeps working
  //     and returns the baked tree to adopt, and
  //   - every other surface (cms_page / talent_page / talent-site / Lab) bakes
  //     the design and persists it through its OWN SurfaceAdapter.
  // After the write we still run the in-place sync so the server-rendered
  // surface paints the design without a manual reload.
  const handleDesignApply = useCallback(
    (summary: PageDesignSummary) => {
      setDesignError(null);
      setPendingDesignId(summary.id);
      startDesignApply(async () => {
        // The homepage-only authoritative write, passed to the chokepoint as
        // `homepageApply`. Kept here (not in edit-context) so the shared
        // EditContext stays free of a storefront-only server-action import.
        const runHomepageApply = async () => {
          const fd = new FormData();
          fd.set("designId", summary.id);
          fd.set("locale", locale);
          const state: ApplyPageDesignState = await applyPageDesignToHomepage(
            undefined,
            fd,
          );
          if (!state?.ok) {
            return {
              ok: false as const,
              error: state?.error ?? "Could not apply the design — try again.",
            };
          }
          return { ok: true as const, tree: state.builderTree };
        };

        if (editCtx) {
          const result = await editCtx.applyPageDesignWithUndo({
            designId: summary.id,
            label: summary.label,
            locale,
            homepageApply: runHomepageApply,
          });
          if (!result.ok) {
            setDesignError(result.error ?? "Could not apply the design — try again.");
            return;
          }
        } else {
          // No EditProvider mounted (legacy homepage fallback) — apply via the
          // homepage server action without the shared snapshot/toast and let
          // the page reload paint the design.
          const result = await runHomepageApply();
          if (!result.ok) {
            setDesignError(result.error);
            return;
          }
        }
        // The homepage paints its design from the SERVER-rendered storefront
        // body, so it runs the in-place starter-sync (or reloads) to repaint
        // without a manual refresh. Non-homepage surfaces already repainted
        // live via the EditContext canvas bridge (applyPageDesignWithUndo →
        // setBuilderTree), so a reload would be jarring and is skipped.
        if (isHomepageSurface) {
          await requestStarterSync();
        }
      });
    },
    [editCtx, locale, requestStarterSync, isHomepageSurface],
  );

  // AI-1 — compose a page from a one-line brief and apply it through the SAME
  // shared `applyTemplateWithUndo` chokepoint as a template/design apply, so the
  // AI result is snapshotted, undoable via the shared toast, and autosaved
  // identically on every surface. The composer returns a validated, governed
  // BuilderNode tree (presets only, never arbitrary nodes); here we only persist
  // + adopt it. Routed through the active SurfaceAdapter's tree-replace path the
  // chokepoint owns — no homepage-only fork, no raw setBuilderTree.
  const handleAiCompose = useCallback(
    async (brief: string): Promise<{ ok: boolean; error?: string }> => {
      if (!editCtx) {
        return {
          ok: false,
          error: "AI compose needs an active editor — reload and try again.",
        };
      }
      setAiPending(true);
      try {
        const composed = await composePageFromBriefAction({
          brief,
          surface: textToPageSurface,
          locale,
        });
        if (!composed.ok) {
          return {
            ok: false,
            error: composed.error ?? "Could not compose a page — try again.",
          };
        }
        const result = await editCtx.applyComposedTreeWithUndo({
          tree: composed.builderTree,
          label: composed.label,
        });
        if (!result.ok) {
          return {
            ok: false,
            error: result.error ?? "Could not apply the page — try again.",
          };
        }
        return { ok: true };
      } finally {
        setAiPending(false);
      }
    },
    [editCtx, textToPageSurface, locale],
  );

  function handleQuickHeroInsert() {
    setQuickInsertError(null);
    if (!isHomepageSurface && editCtx) {
      // Non-homepage: route the first-block insert through the shared Add
      // Gallery chokepoint (undo + autosave + adapter persistence inherited).
      editCtx.toggleAddMenu();
      return;
    }
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

        {/* World-class full-page designs — the new 2026 starting point. Filtered
            to the active surface's audience (talent vs workspace) via
            `starterSummariesForSurface`; the homepage shows the full set. */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {starterSummaries.map((summary) => {
            const busy = designApplyPending && pendingDesignId === summary.id;
            // W6-T4(a) — real editorial photo per design (asset-pipeline ready;
            // falls back to the tinted gradient + placeholder bars when no photo
            // maps, so the card is never a bare gray box).
            const thumb = pageDesignThumbnail(summary.id, summary.archetype);
            return (
              <button
                key={summary.id}
                type="button"
                disabled={designApplyPending}
                title={`Use the ${summary.label} design`}
                onClick={() => handleDesignApply(summary)}
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
        {designError ? (
          <div className="mx-auto mt-3 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
            {designError}
          </div>
        ) : null}

        {/* AI-1 — text-to-page: describe the page and the shared composer
            assembles it from the SAME designed presets, applied through the
            shared undo chokepoint. Requires an active EditContext (every modern
            mount has one); the legacy no-EditContext homepage fallback omits it
            since it has no client tree-replace path. */}
        {editCtx ? (
          <AIBriefInput
            onCompose={handleAiCompose}
            pending={aiPending}
            disabled={designApplyPending || quickInsertPending}
          />
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

        {/* CANVAS-4 — the post-apply Undo affordance is now the SHARED
            TemplateAppliedToast (edit-shell), raised by applyTemplateWithUndo on
            every surface. The old per-card bespoke undo affordance was removed
            so the homepage no longer forks its own undo UI. */}
      </div>
    </div>
  );
}
