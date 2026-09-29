"use client";

/**
 * ThemeTokenPreviewFrame — the client half of the `kind=talent-theme` preview
 * (deliverable 0.C-2). Wraps the hydrated Design render with the effective
 * CSS-var / data-attr projection (`designTokensToCssVars` /
 * `designTokensToDataAttrs`, the SAME projection `render-max-site.tsx` uses),
 * then listens for a same-origin `tulala:theme-tokens` postMessage
 * (`useThemePreview.sendTokens`) and merges it into the live token map —
 * no reload, no re-fetch. This is how the gallery's LookRow restyles the
 * preview instantly while the talent tries different Looks.
 */
import { useEffect, useState } from "react";

import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { THEME_TOKENS_MESSAGE_TYPE } from "@/components/talent/site/theme-gallery/useThemePreview";
import { classifyPreviewClick, previewDemoNote, type GuardElement } from "./preview-demo-guard";

export function ThemeTokenPreviewFrame({
  initialTokens,
  locale = "en",
  designSlug,
  children,
}: {
  initialTokens: Record<string, string>;
  locale?: "en" | "es";
  /** The Design slug (a marker; its token defaults come from `design-type-system.ts`). */
  designSlug?: string;
  children: React.ReactNode;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [demoNote, setDemoNote] = useState(false);

  // Demo preview safety: booking / inquiry taps write nothing (demo mode) and
  // say so; links that would leave the preview are blocked.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? (event.target as GuardElement) : null;
      const verdict = classifyPreviewClick(target);
      if (!verdict) return;
      if (verdict === "block") event.preventDefault();
      setDemoNote(true);
    }
    function onAsk() {
      setDemoNote(true);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("tulala:ask-question", onAsk);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("tulala:ask-question", onAsk);
    };
  }, []);

  useEffect(() => {
    if (!demoNote) return;
    const t = window.setTimeout(() => setDemoNote(false), 3500);
    return () => window.clearTimeout(t);
  }, [demoNote]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (typeof window === "undefined" || event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; tokens?: unknown } | null;
      if (!data || data.type !== THEME_TOKENS_MESSAGE_TYPE) return;
      if (!data.tokens || typeof data.tokens !== "object") return;
      const incoming: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.tokens as Record<string, unknown>)) {
        if (typeof value === "string") incoming[key] = value;
      }
      setTokens((prev) => ({ ...prev, ...incoming }));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const cssVars = designTokensToCssVars(tokens);
  const headingFamily = tokens["typography.heading-font-family"]?.trim();
  const bodyFamily = tokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;
  const dataAttrs = designTokensToDataAttrs(tokens);

  return (
    <div
      data-theme-canvas-root=""
      data-talent-theme-preview=""
      {...(designSlug ? { "data-talent-design": designSlug } : {})}
      {...dataAttrs}
      style={{
        ...(cssVars as React.CSSProperties),
        minHeight: "100vh",
        backgroundColor: "var(--token-color-background, #ffffff)",
      }}
    >
      {children}
      {demoNote ? (
        <p
          role="status"
          data-testid="preview-demo-note"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            zIndex: 2147483000,
            margin: 0,
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(17,17,17,0.9)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {previewDemoNote(locale)}
        </p>
      ) : null}
    </div>
  );
}
