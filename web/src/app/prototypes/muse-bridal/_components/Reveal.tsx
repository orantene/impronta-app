"use client";

import { type CSSProperties, type ElementType, type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Soft fade-in on scroll.
 *
 * Future systemization (Theme → Motion Preset):
 *   - Single tunable: preset = 'refined' (default) | 'editorial' | 'none'.
 *     Each preset maps to different timing curves in `muse.css`.
 *   - Respects `prefers-reduced-motion` via CSS (already scoped in muse.css).
 */
export function Reveal({
  children,
  as,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: 0 | 1 | 2 | 3 | 4;
  className?: string;
  style?: CSSProperties;
}) {
  const Tag: ElementType = as ?? "div";
  const ref = useRef<HTMLElement>(null);
  /**
   * Two-stage opacity to avoid "content permanently invisible if JS fails":
   *   - `ready=false` (SSR / no-JS): element stays at opacity 1 (CSS default).
   *   - `ready=true` after mount: element snaps to opacity 0.
   *   - `visible=true` after IntersectionObserver: element fades up.
   */
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Respect reduced-motion: skip the hide-then-show choreography entirely.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    // Browsers without IntersectionObserver: render visible immediately.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Mark ready (switches CSS to the hidden starting state), then watch.
    // Using rAF so the layout paint happens in a single frame and the
    // fade-in reads as a transition rather than a snap.
    const raf = requestAnimationFrame(() => setReady(true));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`muse-reveal ${className}`.trim()}
      data-ready={ready || undefined}
      data-visible={visible || undefined}
      data-delay={delay || undefined}
      style={style}
    >
      {children}
    </Tag>
  );
}
