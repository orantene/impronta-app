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
import { useRouter, useSearchParams } from "next/navigation";

import { addEmptyCanvasHeroAction } from "@/lib/site-admin/edit-mode/starter-action";
import { generateBuilderNodesAction } from "@/lib/site-admin/builder-core/ai/generate-nodes-action";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { AIBriefInput } from "./ai-brief-input";
import { Segmented } from "./kit/segmented";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit";
import { useMaybeEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import {
  starterSurfaceForKind,
  textToPageSurfaceForStarterSurface,
} from "./empty-canvas-starter-surface";
import {
  deriveSectionLabels,
  computeAiFrontDoorPhase,
  shouldOpenAiFrontDoor,
} from "./empty-canvas-ai-front-door";

export function EmptyCanvasStarter({
  locale = "en",
}: {
  locale?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useEditorLocale();
  const editCtx = useMaybeEditContext();
  // W3-AI1 — the hub "Describe with AI" create entry deep-links a fresh page
  // with `?ai=1`; on that surface the AI brief opens focused so the operator
  // lands ready to type. A normal `?edit=1` load keeps "Start here" in focus.
  const openAiFrontDoor = shouldOpenAiFrontDoor(searchParams);
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
  // Preview-before-apply: the generator returns a validated tree, but instead of
  // committing it optimistically we stash it and show the operator what was made
  // (section labels) with Add / Regenerate / Discard — cheap iteration is the
  // real value of the AI path. Only "Add" runs the shared undo chokepoint.
  const [pendingGen, setPendingGen] = useState<{
    tree: BuilderNodeTree;
    label: string;
    brief: string;
    sectionLabels: string[];
  } | null>(null);
  const [applyPending, setApplyPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // W3-AI1 — the compose-level failure (no draft produced), tracked here purely
  // so the front-door phase attribute reflects the "error" state. The message
  // itself is still shown by AIBriefInput (we return it to the field), so this
  // never double-renders — it only powers `data-ai-front-door-phase`.
  const [composeError, setComposeError] = useState<string | null>(null);

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
  // Generate (do NOT apply yet) — stash the validated tree for preview.
  const handleAiCompose = useCallback(
    async (brief: string): Promise<{ ok: boolean; error?: string }> => {
      if (!editCtx) {
        return {
          ok: false,
          error: "AI needs an active editor. Reload and try again.",
        };
      }
      setAiPending(true);
      setPreviewError(null);
      setComposeError(null);
      try {
        const generated = await generateBuilderNodesAction({
          brief,
          scope: aiMode,
          surface: textToPageSurface,
          locale,
          // AIQ-12 — the active theme's background mode drives the model's
          // light/dark color guidance. Read from the builder DOM (the canvas the
          // user is looking at); server maps it to polarity.
          backgroundMode:
            document.documentElement.getAttribute("data-token-background-mode") ?? undefined,
        });
        if (!generated.ok) {
          const message = generated.error ?? t("Could not design that. Try again.");
          setComposeError(message);
          return { ok: false, error: message };
        }
        const sectionLabels = deriveSectionLabels(generated.builderTree);
        setPendingGen({
          tree: generated.builderTree,
          label: generated.label,
          brief,
          sectionLabels,
        });
        return { ok: true };
      } finally {
        setAiPending(false);
      }
    },
    [editCtx, aiMode, textToPageSurface, locale, t],
  );

  // "Add to page" — commit the previewed tree through the shared undo chokepoint
  // (snapshot + Undo toast + autosave inherited). The starter unmounts as the
  // canvas fills.
  const handleApplyPreview = useCallback(async () => {
    if (!pendingGen || !editCtx) return;
    setApplyPending(true);
    setPreviewError(null);
    try {
      const result = await editCtx.applyComposedTreeWithUndo({
        tree: pendingGen.tree,
        label: pendingGen.label,
      });
      if (!result.ok) {
        setPreviewError(result.error ?? "Could not add it. Try again.");
        return;
      }
      setPendingGen(null);
    } finally {
      setApplyPending(false);
    }
  }, [pendingGen, editCtx]);

  // "Regenerate" — throw away the draft and re-run the SAME brief (the cheap
  // iteration loop). No cost until the operator likes one and Adds it.
  const handleRegenerate = useCallback(() => {
    const brief = pendingGen?.brief;
    if (!brief) return;
    // Keep the current draft visible (buttons disable while aiPending) until the
    // new one replaces it — no flash back to the empty input.
    void handleAiCompose(brief);
  }, [pendingGen, handleAiCompose]);

  // W3-AI1 — the observable idle → generating → preview → error state of the AI
  // front door, stamped on the module so every state (and therefore every
  // button) is verifiable and never a silent dead end.
  const aiPhase = computeAiFrontDoorPhase({
    generating: aiPending,
    hasPreview: Boolean(pendingGen),
    error: previewError ?? composeError,
  });

  // The manual path. When the AI front door is present (an active EditContext)
  // this is the lighter secondary option; on the legacy homepage mount (no
  // EditContext, so no AI) it stays the full-size primary card.
  const startHereSecondary = Boolean(editCtx);
  const startHereButton = (
    <button
      type="button"
      data-empty-canvas-quick-add="layout"
      disabled={quickInsertPending}
      onClick={handleStartHere}
      className={`group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white/60 text-center transition-colors duration-200 hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:cursor-not-allowed disabled:opacity-60 ${
        startHereSecondary ? "gap-2.5 px-6 py-9" : "gap-4 px-6 py-16"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors group-hover:border-stone-300 group-hover:text-stone-700 ${
          startHereSecondary ? "h-10 w-10" : "h-12 w-12"
        }`}
      >
        {quickInsertPending ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="animate-spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </span>
      <span
        className={`font-semibold leading-[1.1] tracking-tight text-stone-900 ${
          startHereSecondary ? "text-[18px]" : "text-[26px]"
        }`}
      >
        {t("Start from scratch")}
      </span>
      <span className="max-w-sm text-sm leading-relaxed text-stone-500">
        {t(
          "Click to choose a layout and add your first block. Nothing goes live until you publish.",
        )}
      </span>
    </button>
  );

  // The AI front door — describe a full page or a single section and the shared
  // generator builds it as real, editable freeform components. Requires an
  // active EditContext (the legacy no-EditContext homepage mount has no client
  // tree-replace path), so it renders only there and leads on those surfaces.
  const aiFrontDoor = editCtx ? (
    <div
      data-ai-front-door=""
      data-ai-front-door-phase={aiPhase}
      className="p-6"
      style={{
        borderRadius: CHROME_RADII.xl,
        border: `1px solid ${CHROME.line}`,
        background: "linear-gradient(180deg, rgba(124,58,237,0.06), #ffffff 66%)",
        boxShadow: CHROME_SHADOWS.card,
      }}
    >
      {/* One cohesive AI module: accent chip + title + the mode switch, then
          the brief field (embedded, header-less). */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center"
            style={{ borderRadius: 11, background: "rgba(124, 58, 237, 0.10)", color: CHROME.accent }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.9 4.8L19 9.7l-4.1 2.9L16 18l-4-2.8L8 18l1.1-5.4L5 9.7l5.1-1.9z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold" style={{ color: CHROME.ink, letterSpacing: "-0.01em" }}>
              {aiMode === "page" ? t("Describe your page") : t("Describe a section")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: CHROME.muted }}>
              {aiMode === "page"
                ? t("Describe your page and AI builds it as editable blocks.")
                : t("Describe one section and AI builds it as editable blocks.")}
            </p>
          </div>
        </div>
        <Segmented
          value={aiMode}
          onChange={setAiMode}
          options={[
            { value: "page", label: t("Full page") },
            { value: "section", label: t("Section") },
          ]}
          compact
        />
      </div>
      <div className="mt-4">
        {pendingGen ? (
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${CHROME.line}`,
              background: CHROME.controlFill,
              padding: 14,
            }}
          >
            <p className="text-[12.5px] font-semibold" style={{ color: CHROME.ink }}>
              {pendingGen.sectionLabels.length === 1
                ? t("AI drafted 1 section. Review, then add.")
                : t("AI drafted {count} sections. Review, then add.").replace(
                    "{count}",
                    String(pendingGen.sectionLabels.length),
                  )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pendingGen.sectionLabels.map((l, i) => (
                <span
                  key={`${l}-${i}`}
                  className="px-2 py-1 text-[11px]"
                  style={{ borderRadius: 999, background: "rgba(124,58,237,0.10)", color: CHROME.accent }}
                >
                  {l}
                </span>
              ))}
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyPreview}
                disabled={applyPending || aiPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderRadius: 9, background: CHROME.accent }}
              >
                {applyPending ? t("Adding…") : t("Add to page")}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={applyPending || aiPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderRadius: 9, border: `1px solid ${CHROME.controlBorder}`, background: "#fff", color: CHROME.ink }}
              >
                {aiPending ? t("Regenerating…") : t("Regenerate")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingGen(null);
                  setPreviewError(null);
                  setComposeError(null);
                }}
                disabled={applyPending || aiPending}
                className="px-2.5 py-2 text-[12.5px] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ color: CHROME.muted, background: "transparent", border: "none" }}
              >
                {t("Discard")}
              </button>
            </div>
            {previewError ? (
              <div
                role="alert"
                className="mt-3 px-3 py-2 text-xs"
                style={{ borderRadius: 10, border: `1px solid ${CHROME.roseLine}`, background: CHROME.roseBg, color: CHROME.rose }}
              >
                {previewError}
              </div>
            ) : null}
          </div>
        ) : (
          <AIBriefInput
            variant="embedded"
            showHeader={false}
            autoFocus={openAiFrontDoor}
            onCompose={handleAiCompose}
            pending={aiPending}
            disabled={quickInsertPending}
            ctaLabel={aiMode === "page" ? t("Design page") : t("Build section")}
            pendingLabel={aiMode === "page" ? t("Designing…") : t("Building…")}
            placeholder={
              aiMode === "page"
                ? t("e.g. a homepage for a boutique modeling agency, editorial and minimal")
                : t("e.g. a services section with three cards and a booking button")
            }
          />
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      data-builder-selector-surface
      className="mx-auto my-16 w-full max-w-3xl px-6"
    >
      {aiFrontDoor ? (
        <>
          {aiFrontDoor}
          {/* "or" divider between the AI front door and the manual path. */}
          <div className="my-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1" style={{ background: CHROME.line }} />
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: CHROME.muted }}>
              {t("or")}
            </span>
            <span className="h-px flex-1" style={{ background: CHROME.line }} />
          </div>
          {startHereButton}
        </>
      ) : (
        startHereButton
      )}

      {quickInsertError ? (
        <div className="mx-auto mt-4 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700">
          {quickInsertError}
        </div>
      ) : null}
    </div>
  );
}
