"use client";

/**
 * The freeform form's answer to "did that work?".
 *
 * The submit endpoint already did its half: success redirects back to the page
 * with `?__tulala_form=ok`, a rejection with `?__tulala_form_err=<code>`. The
 * SECTION renderer reads those flags and shows a sentence. The FREEFORM
 * renderer - the one Impronta's contact page actually uses - read neither: a
 * visitor sent their brief, the page reloaded looking identical with the
 * fields cleared, and nothing anywhere said whether it worked. A form that
 * accepts a message and says nothing back is indistinguishable from one that
 * lost it.
 *
 * A client component rather than an inline script, from tonight's scar: React
 * streams segment HTML through the RSC payload and inline scripts injected
 * that way never execute (the captcha stamper's first version died of exactly
 * this).
 *
 * The flags are consumed - stripped from the URL with replaceState after
 * reading - so a bookmarked or shared URL does not carry a stale "thank you",
 * and the banner scrolls itself into view because the redirect lands the
 * visitor at the top of the page while the form (and this banner) usually sit
 * well below the fold.
 */

import { useEffect, useState } from "react";

const MESSAGES: Record<string, { en: string; es: string; tone: "ok" | "err" }> = {
  ok: {
    en: "Thank you — your message is on its way. We reply within 24 hours.",
    es: "Gracias — tu mensaje va en camino. Respondemos en 24 horas.",
    tone: "ok",
  },
  captcha: {
    en: "The captcha didn't go through — please tick it and send again.",
    es: "El captcha no pasó — márcalo e inténtalo de nuevo.",
    tone: "err",
  },
  rate_limited: {
    en: "Too many messages from this connection — please wait a moment and try again.",
    es: "Demasiados mensajes desde esta conexión — espera un momento e inténtalo de nuevo.",
    tone: "err",
  },
  too_large: {
    en: "That file is too large to attach.",
    es: "Ese archivo es demasiado grande para adjuntarlo.",
    tone: "err",
  },
  too_many: {
    en: "Too many files — please attach fewer and try again.",
    es: "Demasiados archivos — adjunta menos e inténtalo de nuevo.",
    tone: "err",
  },
  total_too_large: {
    en: "The attachments together are too large — please send fewer or smaller files.",
    es: "Los adjuntos juntos son demasiado pesados — envía menos archivos o más ligeros.",
    tone: "err",
  },
  unsupported_type: {
    en: "That file type isn't supported.",
    es: "Ese tipo de archivo no es compatible.",
    tone: "err",
  },
  not_accepted: {
    en: "That file couldn't be accepted.",
    es: "Ese archivo no pudo aceptarse.",
    tone: "err",
  },
  required: {
    en: "A required file is missing — please attach it and send again.",
    es: "Falta un archivo obligatorio — adjúntalo y envía de nuevo.",
    tone: "err",
  },
  store_failed: {
    en: "We couldn't receive your file — please try again in a moment.",
    es: "No pudimos recibir tu archivo — inténtalo de nuevo en un momento.",
    tone: "err",
  },
};

const FALLBACK_ERR = {
  en: "Something went wrong sending your message — please try again.",
  es: "Algo salió mal al enviar tu mensaje — inténtalo de nuevo.",
};

export function FormResultBanner({ locale }: { locale?: string | null }) {
  const [result, setResult] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ok = url.searchParams.get("__tulala_form") === "ok";
      const err = url.searchParams.get("__tulala_form_err");
      if (!ok && !err) return undefined;
      const lang = (locale ?? "en").toLowerCase().startsWith("es") ? "es" : "en";
      if (ok) {
        setResult({ text: MESSAGES.ok![lang], tone: "ok" });
      } else {
        const known = err ? MESSAGES[err] : undefined;
        setResult({ text: known ? known[lang] : FALLBACK_ERR[lang], tone: "err" });
      }
      // Consume the flags on the visitor's FIRST INTERACTION, not on a timer:
      // Next re-syncs its own URL when hydration completes, and hydration of a
      // full storefront page outlasts any timer worth hardcoding - a 600ms
      // replaceState was measured being overwritten on localhost. By the time
      // the visitor touches the page the router has settled, and clearing the
      // flag once they move on is the right semantics anyway: a refresh before
      // that legitimately re-shows the banner.
      const clean = () => {
        try {
          const later = new URL(window.location.href);
          later.searchParams.delete("__tulala_form");
          later.searchParams.delete("__tulala_form_err");
          window.history.replaceState(window.history.state, "", later.toString());
        } catch {
          /* cosmetic - the banner already showed */
        }
      };
      // Capture phase: surfaces like the edit-mode chrome stopPropagation on
      // pointer events, and a bubble listener on window never hears them.
      window.addEventListener("pointerdown", clean, { once: true, capture: true });
      window.addEventListener("keydown", clean, { once: true, capture: true });
      return () => {
        window.removeEventListener("pointerdown", clean, { capture: true });
        window.removeEventListener("keydown", clean, { capture: true });
      };
    } catch {
      // A banner that fails to mount must never take the form with it.
    }
    return undefined;
  }, [locale]);

  useEffect(() => {
    if (!result) return;
    const el = document.querySelector("[data-form-result-banner]");
    el?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [result]);

  if (!result) return null;

  const ok = result.tone === "ok";
  return (
    <p
      data-form-result-banner=""
      role={ok ? "status" : "alert"}
      style={{
        margin: 0,
        padding: "0.85rem 1rem",
        borderRadius: "3px",
        fontSize: "0.95rem",
        lineHeight: 1.5,
        border: `1px solid ${ok ? "rgba(80,160,110,0.55)" : "rgba(200,90,70,0.55)"}`,
        background: ok ? "rgba(80,160,110,0.12)" : "rgba(200,90,70,0.10)",
        color: "var(--token-color-ink, inherit)",
      }}
    >
      {result.text}
    </p>
  );
}
