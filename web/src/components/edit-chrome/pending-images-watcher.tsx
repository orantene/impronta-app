"use client";

/**
 * PendingImagesWatcher — the builder side of the per-site image job (03 §4b).
 * Reads the tenant's stored assignments; while any slot is pending it shows a
 * quiet pill, marks the matching canvas images (`data-image-pending`) so the
 * stylesheet can dim them, polls every 5 s, and refreshes the route once a
 * pending slot has been swapped so the canvas shows the tenant's own photo.
 * Nothing here blocks editing; a user who replaces the image by hand wins on
 * the server (replaced_by_user_at) and the badge simply goes.
 * TUL-81: the pill shows progress, ends on done / failed / stale (see
 * pending-images-pill-state.ts), is dismissible, and sits bottom-left clear of
 * the canvas content.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { actionListAssetAssignments } from "@/lib/media/asset-assignments-actions";

import {
  PENDING_PILL_RESULT_MS,
  nextOutcome,
  resolvePillState,
  type PillInput,
} from "./pending-images-pill-state";
import { useEditorLocale } from "./use-editor-locale";

const POLL_MS = 5_000;

function markCanvasImages(pendingSrcs: ReadonlyArray<string>) {
  if (typeof document === "undefined") return;
  const wanted = pendingSrcs.map((s) => [s, encodeURIComponent(s)] as const);
  document.querySelectorAll<HTMLImageElement>("img[data-image-pending]").forEach((img) => img.removeAttribute("data-image-pending"));
  if (wanted.length === 0) return;
  document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const src = img.currentSrc || img.src || "";
    if (wanted.some(([raw, enc]) => src.includes(raw) || src.includes(enc))) img.setAttribute("data-image-pending", "true");
  });
}

export function PendingImagesWatcher() {
  const router = useRouter();
  const { t } = useEditorLocale();
  const [run, setRun] = useState<Omit<PillInput, "now">>({
    pending: 0, total: 0, startedAt: null, dismissed: false,
    pollErrors: 0, outcome: null, outcomeAt: null,
  });
  const [now, setNow] = useState(() => Date.now());
  const lastKeyRef = useRef<string | null>(null);
  const hadPendingRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const totalRef = useRef(0);
  const errorsRef = useRef(0);
  const stoppedRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const publish = (pending: number, outcome: PillInput["outcome"]) => {
      const at = Date.now();
      setNow(at);
      setRun((prev) => ({
        pending,
        total: totalRef.current,
        startedAt: startedAtRef.current,
        dismissed: dismissedRef.current,
        pollErrors: errorsRef.current,
        outcome: outcome ?? (pending > 0 ? null : prev.outcome),
        outcomeAt: outcome ? at : pending > 0 ? null : prev.outcomeAt,
      }));
    };
    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      const res = await actionListAssetAssignments().catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        if (!hadPendingRef.current) {
          // Not a workspace surface (lab, preview) or no rows yet: stop quietly.
          stoppedRef.current = true;
          return;
        }
        errorsRef.current += 1;
        const o = nextOutcome({ pending: 1, hadPending: true, startedAt: startedAtRef.current, now: Date.now(), pollErrors: errorsRef.current });
        if (o) {
          stoppedRef.current = true;
          markCanvasImages([]);
          publish(0, o);
          return;
        }
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      errorsRef.current = 0;
      const next = res.items.filter((i) => i.pending);
      const key = res.items.map((i) => `${i.pageRole}|${i.slot}|${i.src}|${i.pending ? 1 : 0}`).join("\n");
      if (lastKeyRef.current !== null && lastKeyRef.current !== key && hadPendingRef.current) router.refresh();
      lastKeyRef.current = key;
      const at = Date.now();
      if (next.length > 0 && startedAtRef.current === null) {
        startedAtRef.current = at;
        dismissedRef.current = false;
      }
      totalRef.current = next.length > 0 ? Math.max(totalRef.current, next.length) : totalRef.current;
      const outcome = nextOutcome({ pending: next.length, hadPending: hadPendingRef.current, startedAt: startedAtRef.current, now: at, pollErrors: 0 });
      hadPendingRef.current = next.length > 0;
      if (outcome === "failed-stale") {
        // Server job never finished: stop dimming + polling, tell the user once.
        stoppedRef.current = true;
        markCanvasImages([]);
        publish(0, outcome);
        return;
      }
      markCanvasImages(next.map((i) => i.src));
      if (next.length === 0) {
        startedAtRef.current = null;
        totalRef.current = 0;
      }
      publish(next.length, outcome);
      if (next.length > 0) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      markCanvasImages([]);
    };
  }, [router]);

  // Re-evaluate once the done / failed message has had its time.
  useEffect(() => {
    if (!run.outcome || run.outcomeAt === null) return;
    const id = setTimeout(() => setNow(Date.now()), PENDING_PILL_RESULT_MS + 50);
    return () => clearTimeout(id);
  }, [run.outcome, run.outcomeAt]);

  const state = resolvePillState({ ...run, now });
  if (state.kind === "hidden") return null;

  const label =
    state.kind === "progress"
      ? t("Your photos are being made")
      : state.kind === "done"
        ? t("Your photos are ready")
        : t("We could not finish your photos. Your own images are in place; try again later.");
  return (
    <div
      role="status"
      aria-live="polite"
      data-edit-overlay="pending-images-pill"
      className="fixed bottom-4 left-4 flex max-w-[min(360px,calc(100vw-32px))] items-center gap-2 rounded-full border border-white/15 bg-black/85 py-1.5 pl-3 pr-1.5 text-xs text-white shadow-lg backdrop-blur"
      style={{ zIndex: 84 }}
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full align-middle ${state.kind === "progress" ? "animate-pulse bg-white" : state.kind === "done" ? "bg-emerald-300" : "bg-rose-300"}`}
        aria-hidden
      />
      <span className="min-w-0">
        {label}
        {state.kind === "progress" ? (
          <span className="text-white/70"> · {`${state.total - state.count}/${state.total}`}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => {
          dismissedRef.current = true;
          setRun((prev) => ({ ...prev, dismissed: true }));
        }}
        aria-label={t("Dismiss")}
        title={t("Dismiss")}
        className="ml-1 shrink-0 rounded-full px-1.5 text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
