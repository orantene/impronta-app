import { CATALOG_OVERLAY_CSS, FLOATING_OVERLAY_STACK_CSS } from "./floating-overlay-stack-css";

export { CATALOG_OVERLAY_CSS, FLOATING_OVERLAY_STACK_CSS };

/** SSR-safe style tag; mount once from the root layout. */
export function FloatingOverlayStackStyles() {
  return <style>{FLOATING_OVERLAY_STACK_CSS}</style>;
}
