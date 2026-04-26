/**
 * Phase 5 — global JSX type for the @lottiefiles/lottie-player web-component.
 * The element is loaded lazily via a <script type="module"> tag the
 * Lottie section's renderer injects (no runtime npm dep). This ambient
 * declaration just tells TypeScript that the custom element exists so
 * `<lottie-player>` JSX type-checks.
 */

import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lottie-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          speed?: string | number;
          loop?: string | boolean;
          autoplay?: string | boolean;
          hover?: string | boolean;
          click?: string | boolean;
          background?: string;
          mode?: "normal" | "bounce";
          renderer?: "svg" | "canvas" | "html";
        },
        HTMLElement
      >;
    }
  }
}
