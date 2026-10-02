"use client";
/**
 * Embeds the owner's Nail Studio AS-IS (public/apps/nail-studio) in a responsive
 * iframe and bridges its save/share messages to the front-door chat.
 */
import { useEffect, useRef } from "react";

import { isNailStudioMessage, nailStudioSrc, nailStudioSummary } from "./nail-designer-model";

export const NAIL_STUDIO_FRAME_CSS = ".sb-nd-frame{height:900px}@media (min-width:768px){.sb-nd-frame{height:780px}}";

export function NailStudioFrame({ locale }: { locale: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const es = locale.toLowerCase().startsWith("es");

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

  return (
    <>
      <style>{NAIL_STUDIO_FRAME_CSS}</style>
      <iframe
        ref={ref}
        className="sb-nd-frame"
        src={nailStudioSrc(locale)}
        title={es ? "Diseñador de uñas" : "Nail Designer"}
        loading="lazy"
        allow="clipboard-write; web-share"
        style={{ width: "100%", border: 0, display: "block", borderRadius: "var(--site-radius-lg, 16px)" }}
      />
    </>
  );
}
