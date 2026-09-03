"use client";
import * as Sentry from "@sentry/nextjs";

import { logServerError } from "@/lib/server/safe-error";

import Link from "next/link";
import { useEffect, useState } from "react";

// E.1 — Branded 5xx page (client component — required by Next).
//
// Cannot read server headers here (error.tsx is a client boundary), so
// we detect agency host from `window.location.hostname` post-mount:
// anything outside tulala.digital + app.tulala.digital is treated as an
// agency storefront and rendered with calmer "we hit a snag" copy +
// "Powered by Tulala" footer. SSR pass renders the platform variant —
// the agency variant only matters once the page is interactive anyway.

const PLATFORM_HOSTS = new Set([
  "tulala.digital",
  "www.tulala.digital",
  "app.tulala.digital",
  "marketing.tulala.digital",
  "localhost",
  "127.0.0.1",
]);

/**
 * Stale-client auto-recovery.
 *
 * With continuous deploys, a visitor whose tab predates the current build
 * requests chunks / RSC payloads that no longer exist on the alias. The
 * resulting ChunkLoadError / failed-import surfaces here ~2s after paint as
 * a "We hit a snag" card that a real user reported on the directory. A full
 * reload fixes it 100% of the time — so do that FOR them, once.
 *
 * sessionStorage guards the retry: one automatic reload per session. If the
 * error persists after a fresh document (a genuine bug, not staleness), the
 * card renders as before instead of reload-looping.
 */
const RELOADED_KEY = "tulala-stale-reload";

function isStaleClientError(error: Error & { digest?: string }): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError|Loading chunk|dynamically imported module|import\(\) failed|Failed to fetch dynamically imported/i.test(
      text,
    ) ||
    // Minified React hydration/render errors (#310, #423, #425) — on a stale
    // client these are skew symptoms; a fresh document resolves them.
    /Minified React error #(310|418|423|425)/.test(text)
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isAgencyHost, setIsAgencyHost] = useState(false);
  // Spanish is not a translation pass owed on this component, it was MISSING:
  // both branches were English-only string literals while the businesses this
  // card fronts work in Spanish. Detected client-side for the same reason
  // isAgencyHost is — an error boundary has no server context — so the first
  // paint is EN and it corrects on effect. A brief flash beats a card a
  // visitor cannot read.
  const [isSpanish, setIsSpanish] = useState(false);

  useEffect(() => {
    // Report with enough context to TRIAGE, not just to count.
    //
    // This used to be `logServerError("", error)` — an EMPTY context string, so
    // every client crash in the app landed in Sentry tagged `context: ""` with
    // no route, no host and no digest. When an agency reported this card on
    // /directory (2026-08-08) the investigation went to Vercel logs and found
    // nothing — correctly, because a client-side throw never reaches the
    // server — and the Sentry event that DID exist was unfindable among the
    // untagged. Tag it so the next report is a lookup instead of a hunt.
    try {
      Sentry.withScope((scope) => {
        scope.setTag("context", "app/error-boundary");
        scope.setTag("route", typeof window !== "undefined" ? window.location.pathname : "unknown");
        scope.setTag("host", typeof window !== "undefined" ? window.location.hostname : "unknown");
        scope.setTag("stale_client_shape", String(isStaleClientError(error)));
        scope.setExtra("digest", error?.digest ?? null);
        scope.setExtra("href", typeof window !== "undefined" ? window.location.href : null);
        Sentry.captureException(error);
      });
    } catch {
      // Observability must never break the error page itself.
    }
    logServerError("app/error-boundary", error);
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      setIsAgencyHost(!PLATFORM_HOSTS.has(h));
      // `<html lang>` is set by the app's own locale resolution, so it is the
      // most trustworthy signal available here; navigator.language is the
      // fallback for the case where the document never finished setting up.
      const docLang = document.documentElement.lang || navigator.language || "";
      setIsSpanish(docLang.toLowerCase().startsWith("es"));

      if (isStaleClientError(error)) {
        let alreadyTried = false;
        try {
          alreadyTried = sessionStorage.getItem(RELOADED_KEY) === "1";
          if (!alreadyTried) sessionStorage.setItem(RELOADED_KEY, "1");
        } catch {
          // Storage blocked (private mode) → still reload once per mount;
          // the error card renders if the reload lands back here.
        }
        if (!alreadyTried) window.location.reload();
      }
    }
  }, [error]);

  // COPY RULE, worth keeping if this is ever revised: when a stranger meets a
  // broken page on a small business's site, the one thing that must not happen
  // is that they conclude the BUSINESS is broken. Never name a party to blame,
  // never use a word the reader cannot act on, and say what to do first.
  //
  // The previous platform copy broke all three: "the agency may need to check
  // configuration" blames our customer to our customer's customer, and
  // "configuration" is not something a visitor can do anything about. On a
  // path-based tenant (/w/<slug>) that visitor is a laundry's customer being
  // told the laundry misconfigured something.
  const eyebrow = isAgencyHost ? "STUDIO" : "TULALA";
  const heading = isAgencyHost
    ? isSpanish
      ? "Algo no cargó"
      : "We hit a snag"
    : isSpanish
      ? "Esta página no terminó de cargar"
      : "This page didn't finish loading";
  const body = isAgencyHost
    ? isSpanish
      ? "La página no cargó esta vez. Inténtalo de nuevo y, si sigue pasando, escríbenos desde la página de contacto del estudio."
      : "The page didn't load this time. Please retry, and if it keeps happening, reach out via the studio's contact form."
    : isSpanish
      ? "Es de nuestro lado, no del tuyo. Inténtalo de nuevo y normalmente carga."
      : "This is on our side, not yours. Try again and it usually loads.";
  const retryLabel = isSpanish ? "Reintentar" : "Try again";
  const homeLabel = isSpanish ? "Ir al inicio" : "Go home";

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(11,11,13,0.38)",
            letterSpacing: 0.8,
            textTransform: "uppercase" as const,
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {body}
        </p>
        {error?.digest ? (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(11,11,13,0.35)",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            Ref: {error.digest}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 10,
            marginTop: 24,
          }}
        >
          <button
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              border: "1px solid rgba(24,24,27,0.12)",
              background: "transparent",
              color: "#0B0B0D",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {retryLabel}
          </button>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              // NOT #0F4F3E. That is the ADMIN forest green, and this card
              // renders on public pages for visitors who have never seen the
              // admin. Inline hex is correct HERE — an error boundary must
              // render when the stylesheet itself may have failed — but the
              // VALUE has to be a neutral ink, because this component cannot
              // know the tenant's brand and must not wear ours on their site.
              background: "#18181B",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {homeLabel}
          </Link>
        </div>

        {isAgencyHost ? (
          <p
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 11.5,
              color: "rgba(11,11,13,0.42)",
              marginTop: 24,
              marginBottom: 0,
            }}
          >
            Powered by Tulala
          </p>
        ) : null}
      </div>
    </div>
  );
}
