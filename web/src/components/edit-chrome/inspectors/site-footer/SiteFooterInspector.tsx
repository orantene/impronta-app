"use client";

/**
 * <SiteFooterInspector> — footer parity with the header's Brand / Layout /
 * Navigation drawer.
 *
 * WHAT THIS REPLACES
 * --------------------------------------------------------------------------
 * Until now the footer's only editor was the auto-bound `ZodSchemaForm` on the
 * shell surface: a flat dump of every schema field, with array-of-object
 * columns rendered as raw JSON-ish rows and no reorder, no media picker, no
 * variant preview. The header got a designed drawer; the footer did not. This
 * closes that gap.
 *
 * WHAT IT IS, ARCHITECTURALLY
 * --------------------------------------------------------------------------
 * A FRIENDLY VIEW over the footer landmark's config — the owner's binding
 * decision. The freeform tree stays the store of record for the landmark's
 * CHILDREN; this drawer edits the `site_footer` section row, which is where the
 * bespoke component's configuration lives. The two never meet, so an inspector
 * save cannot disturb operator-added freeform blocks. See
 * `lib/site-admin/site-footer/actions.ts` for the write path and the static
 * guard that pins that property.
 *
 * WHY THE SAVE BUS IS SMALLER THAN THE HEADER'S
 * --------------------------------------------------------------------------
 * The header spans four tables and needs a five-kind queue to keep their CAS
 * pointers straight. The footer is ONE row with ONE version. So the queue here
 * is a single accumulating patch + a debounce, which is the whole of what the
 * data model requires. Copying the header's machinery would have meant five
 * code paths where four are permanently dead.
 *
 * Tab IA follows the header's lesson (6 tabs → 3): group by what the operator
 * is thinking about, not by which schema field it maps to.
 *   - Brand    — the identity block: logo, wordmark, tagline, variant, tone.
 *   - Columns  — the link lists. Its own surface because it is a list editor.
 *   - Legal    — the bottom row: social icons, copyright, small-print links.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useEditContext } from "../../edit-context";
import { CHROME, DrawerBody, DrawerTabs, DrawerTab } from "../../kit";
import {
  loadFooterConfigAction,
  saveFooterSectionAction,
} from "@/lib/site-admin/site-footer/actions";
import type {
  SiteFooterConfig,
  SiteFooterPatchInput,
  SiteFooterSectionValue,
} from "@/lib/site-admin/site-footer/types";

import { useInspectorT } from "../kit/use-inspector-t";
import { BrandTab } from "./tabs/BrandTab";
import { ColumnsTab } from "./tabs/ColumnsTab";
import { LegalTab } from "./tabs/LegalTab";

type TabKey = "brand" | "columns" | "legal";

const TAB_DEFS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "columns", label: "Columns" },
  { key: "legal", label: "Legal" },
];

export type FooterSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

/** The one write affordance every tab receives. */
export interface SiteFooterPatch {
  /**
   * Apply a partial edit. Optimistic locally, debounced to the server, merged
   * onto the row's current props server-side (so a stale client cannot drop a
   * field it does not model).
   */
  patch: (input: SiteFooterPatchInput) => void;
  /** Current value — tabs render from this, never from their own copy. */
  value: SiteFooterSectionValue;
  /** Whether structural/freeform moves are unlocked (agency+). */
  canEditFreeform: boolean;
}

export function SiteFooterInspector({ tenantId }: { tenantId: string }) {
  const { t } = useInspectorT();
  const [tab, setTab] = useState<TabKey>("brand");
  const [config, setConfig] = useState<SiteFooterConfig | null>(null);
  const [shellEditMode, setShellEditMode] = useState<"locked" | "basic" | "full">(
    "basic",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<FooterSaveStatus>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const { queueRouterRefresh } = useEditContext();

  // ── Undo (single-step) ────────────────────────────────────────────────────
  // Same affordance and same rationale as the header's: operators expect to
  // recover from one misclick without paging back through the canvas. Deeper
  // history is the canvas undo stack's job, not a drawer's.
  const undoSnapshotRef = useRef<SiteFooterSectionValue | null>(null);
  const [hasUndo, setHasUndo] = useState(false);

  // Auto-dismiss the "Draft saved" acknowledgement; "Saving…" stays for the
  // whole in-flight window.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const timer = setTimeout(() => {
      setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
    }, 1500);
    return () => clearTimeout(timer);
  }, [status]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = useCallback(() => setLoadAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      const res = await loadFooterConfigAction();
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setConfig(res.config);
      setShellEditMode(res.shellEditMode);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // ── Save queue ────────────────────────────────────────────────────────────
  // One accumulating patch, one CAS pointer. `pendingRef` merges successive
  // edits so a typing burst coalesces into a single round-trip; `inFlightRef`
  // serialises saves so two overlapping writes can never race the CAS.
  const pendingRef = useRef<SiteFooterPatchInput | null>(null);
  const expectedVersionRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleFlush = useCallback((delay = 450) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      void flushRef.current?.();
    }, delay);
  }, []);

  // Cancel a pending flush on unmount — otherwise closing the drawer
  // mid-debounce fires a server action whose response has nowhere to land.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  const flush = useCallback(async () => {
    if (inFlightRef.current) await inFlightRef.current;
    const payload = pendingRef.current;
    const expectedVersion = expectedVersionRef.current;
    if (!payload || expectedVersion === null) return;

    setStatus({ kind: "saving" });
    const work: Promise<void> = (async () => {
      const res = await saveFooterSectionAction({ expectedVersion, patch: payload });
      if (!res.ok) {
        // Leave `pendingRef` intact so Retry re-attempts the SAME payload
        // against the SAME expected version — no resurrection, no double-write.
        setStatus({
          kind: "error",
          message: res.error || "Couldn't save. Try again.",
        });
        return;
      }
      pendingRef.current = null;
      expectedVersionRef.current = res.version;
      setConfig((prev) => (prev ? { ...prev, version: res.version } : prev));
      // The renderer reads the re-baked snapshot, so the canvas needs a refresh
      // to repaint the footer. (`site_footer` is a `hasLiveData` section — see
      // its meta — so a prop edit alone never repaints.)
      startTransition(() => {
        void queueRouterRefresh();
      });
      setStatus({ kind: "saved", at: Date.now() });
    })();

    inFlightRef.current = work;
    await work;
    inFlightRef.current = null;
    // A patch that arrived during the in-flight save — drain again.
    if (pendingRef.current) scheduleFlush();
  }, [queueRouterRefresh, scheduleFlush]);

  // Kept in a ref so the debounce timer always calls the LATEST flush closure
  // without the timer itself being a dependency. Assigned in an effect rather
  // than during render: a render-phase ref write is a React-rules violation
  // (and lints as one), and under StrictMode's double-render it would run
  // twice for one commit.
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const retryFailedSave = useCallback(() => {
    void flush();
  }, [flush]);

  const applyPatch = useCallback(
    (input: SiteFooterPatchInput) => {
      setConfig((prev) => {
        if (!prev) return prev;
        // Snapshot BEFORE the first change of this burst so Undo restores the
        // state the operator last saw settled, not an intermediate keystroke.
        if (!undoSnapshotRef.current) {
          undoSnapshotRef.current = prev.value;
          setHasUndo(true);
        }
        if (expectedVersionRef.current === null) {
          expectedVersionRef.current = prev.version;
        }
        return { ...prev, value: { ...prev.value, ...input } };
      });
      pendingRef.current = { ...(pendingRef.current ?? {}), ...input };
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const handleUndo = useCallback(() => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) return;
    undoSnapshotRef.current = null;
    setHasUndo(false);
    setConfig((prev) => (prev ? { ...prev, value: snapshot } : prev));
    // Replay the WHOLE snapshot as one patch: the merge is field-wise, so
    // sending every field restores each one, including a list the operator
    // emptied (which a diff-based rollback would miss — an empty array is a
    // real value, not an absent one).
    pendingRef.current = { ...snapshot };
    scheduleFlush(0);
  }, [scheduleFlush]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <DrawerBody padding="14px">
        <div
          className="rounded-lg px-3 py-2.5 text-[12px]"
          style={{
            background: CHROME.amberBg,
            border: `1px solid ${CHROME.amberLine}`,
            color: CHROME.amber,
          }}
          role="alert"
        >
          <p className="m-0">
            {t("Couldn’t load the footer.")} {loadError}
          </p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-2 inline-flex cursor-pointer items-center rounded-md px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "white",
              border: `1px solid ${CHROME.amberLine}`,
              color: CHROME.amber,
            }}
          >
            {t("Retry")}
          </button>
        </div>
      </DrawerBody>
    );
  }

  if (!config) {
    return (
      <DrawerBody padding="14px">
        <div className="text-[12px] text-stone-500">{t("Loading footer…")}</div>
      </DrawerBody>
    );
  }

  const patchApi: SiteFooterPatch = {
    patch: applyPatch,
    value: config.value,
    canEditFreeform: shellEditMode === "full",
  };

  return (
    <>
      <div
        className="flex min-w-0 items-end justify-between gap-2 pr-3"
        style={{ borderBottom: `1px solid ${CHROME.line}` }}
      >
        <DrawerTabs>
          {TAB_DEFS.map((definition) => (
            <DrawerTab
              key={definition.key}
              active={tab === definition.key}
              onClick={() => setTab(definition.key)}
            >
              {t(definition.label)}
            </DrawerTab>
          ))}
        </DrawerTabs>
        <UndoButton
          hasUndo={hasUndo}
          onUndo={handleUndo}
          label={t("Undo last change")}
          idleLabel={t("Nothing to undo")}
        />
      </div>
      <DrawerBody
        padding="14px 14px 32px"
        className="[&>*]:min-w-0 overflow-x-hidden"
      >
        <SaveBanner status={status} onRetry={retryFailedSave} />
        <FreeformChildrenNote count={config.freeformChildCount} />
        {tab === "brand" ? (
          <BrandTab api={patchApi} tenantId={tenantId} />
        ) : tab === "columns" ? (
          <ColumnsTab api={patchApi} />
        ) : (
          <LegalTab api={patchApi} />
        )}
      </DrawerBody>
    </>
  );
}

/**
 * Tells the operator the landmark carries freeform blocks this form does not
 * show.
 *
 * Without it the drawer reads as "the footer is these fields", and an operator
 * who added a custom block on the shell surface would reasonably fear that
 * editing a column here had thrown it away. Rendering the count makes the
 * separation visible — and makes it checkable at a glance that a save left the
 * number alone. Hidden at 0/unknown: a note about nothing is noise.
 */
function FreeformChildrenNote({ count }: { count: number | null }) {
  const { t } = useInspectorT();
  if (count === null || count <= 0) return null;
  return (
    <div
      className="mb-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug"
      style={{
        background: "rgba(124, 58, 237, 0.055)",
        border: "1px solid rgba(124, 58, 237, 0.16)",
        color: CHROME.ink2,
      }}
    >
      <span aria-hidden className="mt-[1px] text-[12px]">
        ⧉
      </span>
      <span>
        {count === 1
          ? t("This footer also has 1 custom block, edited on the canvas. Changes here won’t affect it.")
          : t("This footer also has custom blocks, edited on the canvas. Changes here won’t affect them.")}
      </span>
    </div>
  );
}

function UndoButton({
  hasUndo,
  onUndo,
  label,
  idleLabel,
}: {
  hasUndo: boolean;
  onUndo: () => void;
  label: string;
  idleLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={!hasUndo}
      title={hasUndo ? label : idleLabel}
      aria-label={label}
      className={`mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-[opacity,background-color] duration-150 active:scale-[0.96] ${
        hasUndo
          ? "cursor-pointer text-stone-500 hover:bg-[#faf9f6] hover:text-stone-800"
          : "pointer-events-none opacity-30"
      }`}
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
        aria-hidden
      >
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      </svg>
    </button>
  );
}

function SaveBanner({
  status,
  onRetry,
}: {
  status: FooterSaveStatus;
  onRetry: () => void;
}) {
  const { t } = useInspectorT();
  if (status.kind === "error") {
    return (
      <div
        className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700"
        role="alert"
      >
        <span>{status.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium text-red-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 active:opacity-70"
        >
          {t("Retry")}
        </button>
      </div>
    );
  }
  if (status.kind === "saving" || status.kind === "saved") {
    const saving = status.kind === "saving";
    return (
      <div
        className={`mb-3 flex items-center gap-2 text-[10.5px] transition-opacity duration-200 ${
          saving ? "text-stone-500" : "text-emerald-700/70"
        }`}
        aria-live="polite"
      >
        <span
          className={`inline-block size-1.5 rounded-full ${
            saving ? "animate-pulse bg-indigo-400" : "bg-emerald-500"
          }`}
        />
        {saving ? t("Saving…") : t("Draft saved")}
      </div>
    );
  }
  return null;
}
