"use client";

/**
 * Stamp `data-theme` on captcha containers from the page's REAL surface.
 *
 * The hCaptcha widget defaults to its light skin - a white card that glares in
 * the middle of a dark storefront (the owner: "the captcha looks sick"). It
 * accepts `data-theme="dark"`, but nothing server-side knows which surface a
 * tenant paints: themes are tokens, resolved in CSS, and a tenant can be light
 * or dark.
 *
 * TWO WRONG VERSIONS PRECEDED THIS ONE, both caught by measuring on localhost:
 *
 *   1. An inline `<script>` beside the widget. React-streamed segments inject
 *      their HTML via the RSC payload, and scripts injected that way DO NOT
 *      EXECUTE - the stamp never ran.
 *   2. Reading `document.body`'s background. The storefront body is
 *      rgb(249,249,251) - near white - because the DARK surface is painted by
 *      an inner section container, not the body. The heuristic would have
 *      stamped "light" on a dark page: precisely the bug it was meant to fix.
 *
 * So: a client component that renders an invisible marker NEXT TO the widget
 * and, after mount, walks UP from itself to the first ancestor that actually
 * paints an opaque background. That is by definition the surface the captcha
 * card will sit on.
 *
 * If the widget script raced ahead and already drew the wrong-skinned iframe,
 * stamping the attribute is too late - so the container is reset and re-rendered
 * through the provider's own API. Both providers expose exactly this.
 */

import { useEffect, useRef } from "react";

/** Perceptual-enough luminance cut; the widgets only offer two skins. */
export function themeForRgb(rgb: readonly number[]): "dark" | "light" {
  const l = 0.2126 * (rgb[0] ?? 255) + 0.7152 * (rgb[1] ?? 255) + 0.0722 * (rgb[2] ?? 255);
  return l < 140 ? "dark" : "light";
}

/** Parse a computed backgroundColor; null when it is effectively transparent. */
export function parsePaintedRgb(background: string): number[] | null {
  const parts = background ? background.match(/[\d.]+/g) : null;
  if (!parts || parts.length < 3) return null;
  if (parts.length >= 4 && parseFloat(parts[3]!) <= 0.5) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

type CaptchaRenderApi = { render?: (el: Element, opts: Record<string, string>) => unknown };

export function CaptchaThemeStamper() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    try {
      let el: HTMLElement | null = ref.current?.parentElement ?? null;
      let rgb: number[] | null = null;
      while (el) {
        rgb = parsePaintedRgb(getComputedStyle(el).backgroundColor);
        if (rgb) break;
        el = el.parentElement;
      }
      const theme = themeForRgb(rgb ?? [255, 255, 255]);

      document
        .querySelectorAll<HTMLElement>(".h-captcha:not([data-theme]), .cf-turnstile:not([data-theme])")
        .forEach((container) => {
          container.setAttribute("data-theme", theme);
          // The loader may have raced ahead and drawn the default skin already;
          // an attribute cannot restyle an existing iframe, so re-render it.
          if (theme === "dark" && container.querySelector("iframe")) {
            const w = window as unknown as Record<string, CaptchaRenderApi | undefined>;
            const api = container.classList.contains("h-captcha") ? w.hcaptcha : w.turnstile;
            if (api?.render) {
              const sitekey = container.getAttribute("data-sitekey") ?? "";
              container.innerHTML = "";
              api.render(container, { sitekey, theme });
            }
          }
        });
    } catch {
      // A captcha in the wrong skin is a nuisance; a captcha whose bootstrap
      // throws during hydration is a dead form. Never the second one.
    }
  }, []);

  return <span ref={ref} hidden data-captcha-theme-stamper="" />;
}
