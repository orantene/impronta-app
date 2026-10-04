"use client";
/**
 * Embeds the owner's Nail Studio AS-IS (public/apps/nail-studio) in a responsive
 * iframe and bridges its save/share messages to the front-door chat.
 *
 * Wave 4 residual: when `layout` is omitted (live site / builder canvas), pick
 * desktop vs phone from the host width so the section is not a phone column
 * inside a wide desktop frame.
 */
import { useEffect, useRef, useState } from "react";

import { isNailStudioMessage, nailStudioSrc, nailStudioSummary } from "./nail-designer-model";

export const NAIL_STUDIO_FRAME_CSS =
  ".sb-nd{min-width:0;width:100%}.sb-nd-frame{height:900px;width:100%}@media (min-width:768px){.sb-nd-frame{height:780px}}.sb-nd[data-nd-layout=desktop] .sb-nd-frame{min-width:min(100%,821px)}";

const DESKTOP_MIN = 821;

export function NailStudioFrame({
  locale,
  layout,
}: {
  locale: string;
  /** Force desktop or phone layout inside the iframe (gallery Apps device toggle). */
  layout?: "desktop" | "phone";
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const es = locale.toLowerCase().startsWith("es");
  const [autoLayout, setAutoLayout] = useState<"desktop" | "phone" | undefined>(layout);

  useEffect(() => {
    if (layout) {
      setAutoLayout(layout);
      return;
    }
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") {
      setAutoLayout(
        typeof window !== "undefined" && window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`).matches
          ? "desktop"
          : "phone",
      );
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setAutoLayout(w >= DESKTOP_MIN ? "desktop" : "phone");
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!isNailStudioMessage(e, ref.current?.contentWindow, window.location.origin)) return;
      const design = (e.data as { design?: unknown }).design as Parameters<typeof nailStudioSummary>[0];
      window.dispatchEvent(
        new CustomEvent("tulala:ask-question", { detail: { message: nailStudioSummary(design, locale) } }),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [locale]);

  useEffect(() => {
    try {
      ref.current?.contentWindow?.postMessage(
        { target: "nail-designer", type: "lang", lang: es ? "es" : "en" },
        window.location.origin,
      );
    } catch {
      /* frame not ready: ?lang= already set the initial language */
    }
  }, [es]);

  const effective = layout ?? autoLayout;

  return (
    <div ref={hostRef} data-nd-host="" data-nd-layout={effective} className="sb-nd-host w-full min-w-0">
      <style>{NAIL_STUDIO_FRAME_CSS}</style>
      <iframe
        ref={ref}
        className="sb-nd-frame"
        src={nailStudioSrc(locale, effective ? { layout: effective } : {})}
        title={es ? "Diseñador de uñas" : "Nail Designer"}
        loading="lazy"
        allow="clipboard-write; web-share"
        style={{ width: "100%", border: 0, display: "block", borderRadius: "var(--site-radius-lg, 16px)" }}
      />
    </div>
  );
}
