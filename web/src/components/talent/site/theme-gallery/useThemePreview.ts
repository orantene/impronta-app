"use client";

/**
 * useThemePreview — drives the shared `/template-preview/[key]` iframe for the
 * theme gallery (deliverable 0.C-2).
 *
 * Switching the DESIGN navigates the iframe (`?kind=talent-theme`, a new
 * structural tree) because a Design changes the DOM shape, not just tokens.
 * Switching the LOOK does NOT navigate: `sendTokens` posts a same-origin
 * `tulala:theme-tokens` message the preview page listens for
 * (`theme-preview-frame-client.tsx`) and swaps CSS variables in place, so the
 * restyle is instant and never re-triggers the iframe's loading state.
 */
import { useCallback, useMemo, useRef, useState } from "react";

export const THEME_TOKENS_MESSAGE_TYPE = "tulala:theme-tokens";

export interface ThemeTokensMessage {
  type: typeof THEME_TOKENS_MESSAGE_TYPE;
  tokens: Record<string, string>;
}

export type PreviewLoadState = "idle" | "loading" | "ready" | "error";

export function buildThemePreviewUrl(input: {
  designSlug: string;
  lookSlug?: string | null;
  talentProfileId?: string | null;
  locale?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("kind", "talent-theme");
  const lookSlug = input.lookSlug?.trim();
  if (lookSlug) params.set("look", lookSlug);
  const talentProfileId = input.talentProfileId?.trim();
  if (talentProfileId) {
    params.set("talent", talentProfileId);
    params.set("talentProfileId", talentProfileId);
  }
  if (input.locale === "es") params.set("locale", "es");
  return `/template-preview/${encodeURIComponent(input.designSlug)}?${params.toString()}`;
}

export function useThemePreview(opts: { talentProfileId?: string | null; locale?: string | null }) {
  const { talentProfileId, locale } = opts;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loadState, setLoadState] = useState<PreviewLoadState>("idle");
  const [attempt, setAttempt] = useState(0);

  const src = useCallback(
    (designSlug: string, lookSlug?: string | null) =>
      buildThemePreviewUrl({ designSlug, lookSlug, talentProfileId, locale }),
    [talentProfileId, locale],
  );

  const onLoad = useCallback(() => setLoadState("ready"), []);
  const onError = useCallback(() => setLoadState("error"), []);
  const beginLoad = useCallback(() => setLoadState("loading"), []);
  const retry = useCallback(() => {
    setLoadState("loading");
    setAttempt((n) => n + 1);
  }, []);

  /** Instant restyle: post tokens into the SAME iframe document, no reload. */
  const sendTokens = useCallback((tokens: Record<string, string>) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || typeof window === "undefined") return;
    const message: ThemeTokensMessage = { type: THEME_TOKENS_MESSAGE_TYPE, tokens };
    win.postMessage(message, window.location.origin);
  }, []);

  return useMemo(
    () => ({ iframeRef, loadState, attempt, src, onLoad, onError, beginLoad, retry, sendTokens }),
    [loadState, attempt, src, onLoad, onError, beginLoad, retry, sendTokens],
  );
}
