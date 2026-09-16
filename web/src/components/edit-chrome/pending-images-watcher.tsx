"use client";

/**
 * PendingImagesWatcher — the builder side of the per-site image job (03 §4b).
 * Reads the tenant's stored assignments; while any slot is pending it shows a
 * quiet pill, marks the matching canvas images (`data-image-pending`) so the
 * stylesheet can dim them, polls every 5 s, and refreshes the route once a
 * pending slot has been swapped so the canvas shows the tenant's own photo.
 * Nothing here blocks editing; a user who replaces the image by hand wins on
 * the server (replaced_by_user_at) and the badge simply goes.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { actionListAssetAssignments } from "@/lib/media/asset-assignments-actions";

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
  const [pendingCount, setPendingCount] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  const hadPendingRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      const res = await actionListAssetAssignments().catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        // Not a workspace surface (lab, preview) or no rows yet: stop quietly.
        stoppedRef.current = true;
        return;
      }
      const next = res.items.filter((i) => i.pending);
      const key = res.items.map((i) => `${i.pageRole}|${i.slot}|${i.src}|${i.pending ? 1 : 0}`).join("\n");
      if (lastKeyRef.current !== null && lastKeyRef.current !== key && hadPendingRef.current) router.refresh();
      lastKeyRef.current = key;
      hadPendingRef.current = next.length > 0;
      setPendingCount(next.length);
      markCanvasImages(next.map((i) => i.src));
      if (next.length > 0) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      markCanvasImages([]);
    };
  }, [router]);

  if (pendingCount === 0) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-14 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-white/85 shadow-lg backdrop-blur">
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white/80 align-middle" aria-hidden />
      {t("Your photos are being made")}
      <span className="text-white/50"> · {pendingCount}</span>
    </div>
  );
}
