"use client";

import { useEffect, useState } from "react";

/**
 * TUL-59 C item 3: the idle bar's main button follows context. Away from the
 * menu it says "Ver servicios" and scrolls to it; once the menu is on screen
 * it says "Elige un servicio" (nothing to scroll to) and just scrolls the list
 * into place. Once a service is picked, the selection dock ("Continuar") takes
 * over, so this label never has to say it.
 */
export function idleBarLabel(es: boolean, menuInView: boolean): string {
  if (menuInView) return es ? "Elige un servicio" : "Choose a service";
  return es ? "Ver servicios" : "See services";
}

/** True while at least a third of the menu is visible. Stays false without IntersectionObserver. */
function useMenuInView(nodeId: string): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = document.querySelector(`[data-builder-node-id="${nodeId}"]`);
    if (!el) return;
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      threshold: 0.33,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [nodeId]);
  return inView;
}

export function CatalogIdleBarGo({ nodeId, es }: { nodeId: string; es: boolean }) {
  const inView = useMenuInView(nodeId);
  return (
    <button
      type="button"
      className="cb-bar-go"
      data-in-services={inView ? "true" : undefined}
      onClick={() =>
        document.querySelector(`[data-builder-node-id="${nodeId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    >
      {idleBarLabel(es, inView)}
    </button>
  );
}

/**
 * TUL-59 C overlay rules, kept out of the byte-pinned base booking stylesheet.
 * One banner at a time (consent, then language suggestion), neither over a
 * booking window; more air between the selection's x and the chat button.
 */
export const CATALOG_OVERLAY_CSS = `body:has([data-consent-banner]) [data-locale-suggestion],body:has([role="dialog"][aria-modal="true"]) [data-consent-banner],body:has([role="dialog"][aria-modal="true"]) [data-locale-suggestion]{display:none}
.cb-dock{gap:16px}.cb-dock-stack{margin-left:6px}`;

export function CatalogOverlayStyles() {
  return <style>{CATALOG_OVERLAY_CSS}</style>;
}
