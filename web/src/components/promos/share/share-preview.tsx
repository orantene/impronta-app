"use client";

import { useState } from "react";

import { PROMO_COPY_EN, PROMO_COPY_ES } from "@/lib/promos/copy/talent";
import type { ShareLang } from "@/lib/promos/share/captions";

export type SharePreviewState = "loading" | "loaded" | "error";

/** Append a cache-busting param so a retry re-requests instead of reusing a failed response. */
export function withRetryParam(src: string, attempt: number): string {
  if (attempt <= 0) return src;
  return `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;
}

/**
 * Share image preview: fixed aspect box (no layout shift), shimmer while the
 * image loads, neutral fallback plus a retry button when it fails.
 */
export function SharePreview(props: {
  src: string;
  alt: string;
  format: "story" | "post";
  lang: ShareLang;
}) {
  // Keyed by src so a style/lang change resets to loading without an effect.
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<{ key: string; state: SharePreviewState }>({ key: "", state: "loading" });
  const effective = withRetryParam(props.src, attempt);
  const state: SharePreviewState = status.key === effective ? status.state : "loading";
  const copy = props.lang === "es" ? PROMO_COPY_ES : PROMO_COPY_EN;
  const ratio = props.format === "story" ? "aspect-[9/16]" : "aspect-square";

  return (
    <div className={`relative w-full overflow-hidden rounded-lg bg-[var(--tc-border,#e5e5ea)] ${ratio}`}
      data-preview-state={state}>
      {state === "loading" ? (
        <div aria-hidden="true" data-preview-skeleton className="absolute inset-0 bg-black/5 motion-safe:animate-pulse" />
      ) : null}
      {state !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={effective} src={effective} alt={props.alt} loading="lazy"
          onLoad={() => setStatus({ key: effective, state: "loaded" })}
          onError={() => setStatus({ key: effective, state: "error" })}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`} />
      ) : (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="text-[12px] text-[var(--tc-muted,#6b6b6b)]">{copy["share.preview_unavailable"]}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}
            className="min-h-11 rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white px-3 text-[13px] font-medium text-[var(--tc-ink,#1c1c1e)]">
            {copy["share.retry"]}
          </button>
        </div>
      )}
    </div>
  );
}
