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

export function ThemeTokenPreviewFrame({
  initialTokens,
  children,
}: {
  initialTokens: Record<string, string>;
  children: React.ReactNode;
}) {
  const [tokens, setTokens] = useState(initialTokens);

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
      {...dataAttrs}
      style={{
        ...(cssVars as React.CSSProperties),
        minHeight: "100vh",
        backgroundColor: "var(--token-color-background, #ffffff)",
      }}
    >
      {children}
    </div>
  );
}
