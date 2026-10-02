"use client";

import { useEffect, useState, type IframeHTMLAttributes } from "react";
import {
  embedCopy,
  embedsConsented,
  privacyEmbedSrc,
} from "./consent-embed-logic";

/**
 * Click-to-load third-party embed. Nothing from the provider is requested
 * until the visitor clicks, or has already consented to embeds
 * (cookie `tulala_consent` includes "embeds", or analytics consent granted).
 *
 * Fills its parent (which owns the aspect ratio), so layout never shifts.
 */
export function ConsentEmbed({
  src,
  provider,
  title,
  locale,
  className,
  iframeProps,
}: {
  src: string;
  provider: string;
  title: string;
  locale?: string | null;
  /** Applied to the iframe (e.g. site-map__iframe). */
  className?: string;
  iframeProps?: Omit<IframeHTMLAttributes<HTMLIFrameElement>, "src" | "title" | "className">;
}) {
  const [loaded, setLoaded] = useState(false);
  const [lang, setLang] = useState<string | null>(locale ?? null);

  useEffect(() => {
    let analytics: string | null = null;
    try {
      analytics = window.localStorage.getItem("impronta_analytics_consent");
    } catch {
      /* storage blocked */
    }
    if (embedsConsented({ cookieHeader: document.cookie, analyticsConsent: analytics })) {
      setLoaded(true);
    }
    if (!locale) setLang(document.documentElement.lang || null);
  }, [locale]);

  if (loaded) {
    return (
      <iframe
        {...iframeProps}
        src={privacyEmbedSrc(src)}
        title={title}
        className={className ?? "h-full w-full border-0"}
        style={{ border: 0, ...iframeProps?.style }}
      />
    );
  }

  const copy = embedCopy(lang, provider);
  // Keep the prepared src in the unconsented markup so SSR / vendor-locale
  // guards can still see language params (e.g. Maps `hl=`) without loading
  // the third party until the visitor clicks.
  return (
    <div
      data-consent-embed={provider}
      data-embed-src={privacyEmbedSrc(src)}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 120,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 16,
        textAlign: "center",
        background: "rgba(127,127,127,0.12)",
        color: "inherit",
      }}
    >
      <button
        type="button"
        onClick={() => setLoaded(true)}
        style={{
          cursor: "pointer",
          padding: "8px 16px",
          borderRadius: 999,
          border: "1px solid currentColor",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: 14,
        }}
      >
        {copy.load}
      </button>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.75, maxWidth: 360 }}>{copy.note}</p>
    </div>
  );
}
