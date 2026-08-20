/**
 * motion-animation-replay — shared replay trigger for the Motion inspector.
 *
 * Sends an `editor:replayAnimation` message to the active canvas:
 *   - Desktop (in-page client canvas): fires directly on the document,
 *     hitting any listener that's been registered by the renderer.
 *   - Tablet/Mobile (iframe canvas): posts via the existing
 *     `[data-edit-iframe-host] iframe` channel.
 *
 * The renderer handles the actual CSS class-flip. This module is the
 * pure sender side.
 *
 * Reduced-motion safety: callers should suppress the Play button (or show
 * it disabled) when the OS prefers reduced motion. This module still sends
 * the message regardless — the iframe-child handler is the last defence and
 * respects the media query there.
 */

/** Shape of the replay message. */
export interface ReplayAnimationMessage {
  type: "editor:replayAnimation";
  /** Section id to replay (for section-level motion panels). */
  sectionId?: string | null;
  /** Builder-node id to replay (for node-level motion panels). */
  builderNodeId?: string | null;
}

/**
 * Fire an animation replay for the specified node/section.
 *
 * On desktop the canvas is in the same document — we dispatch a custom
 * DOM event that the canvas replay handler listens for.
 * On tablet/mobile we post to the active iframe's contentWindow.
 */
export function triggerAnimationReplay(
  sectionId: string | null | undefined,
  builderNodeId: string | null | undefined,
): void {
  if (typeof document === "undefined") return;

  const payload: ReplayAnimationMessage = {
    type: "editor:replayAnimation",
    sectionId: sectionId ?? null,
    builderNodeId: builderNodeId ?? null,
  };

  // ── Desktop path: dispatch a custom event on the document ──────────────
  // The in-page canvas listener picks this up via addEventListener.
  document.dispatchEvent(
    new CustomEvent("editor:replayAnimation", { detail: payload }),
  );

  // ── Iframe path: also post to any active device-preview iframe ─────────
  // Safe to send to both — the iframe handler ignores it if there's no
  // matching node/section rendered inside.
  const iframe =
    document.querySelector<HTMLIFrameElement>(
      "[data-edit-iframe-host] iframe[data-active=\"true\"]",
    ) ??
    document.querySelector<HTMLIFrameElement>(
      "[data-edit-iframe-host] iframe",
    );
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(payload, window.location.origin);
  }
}

// ── Canvas-side listener (called once from the canvas mount) ──────────────

/**
 * Register the canvas-side animation-replay handler. Call this from the
 * component that owns the builder canvas (ClientBuilderCanvas or the
 * inline-edit page). Returns a cleanup function.
 *
 * When a replay fires the handler looks up the target element by
 * [data-builder-node-id] or [data-section-id], removes its animation CSS,
 * waits one rAF, then re-applies — causing the browser to re-run the
 * keyframe from the start.
 *
 * Reduced-motion: the handler checks `prefers-reduced-motion` and is a
 * no-op when the OS prefers it (unless the section has reducedMotion=always).
 *
 * Ref-counted -- see the guard below.
 */

/**
 * Idempotency guard. The listener used to be registered from exactly one place
 * -- `ClientBuilderCanvas` -- which turned out NOT to mount in the default
 * editor (the canvas is server-rendered unless the client-canvas flag is on).
 * The result: "Preview" dispatched an event that nothing was listening for, in
 * the configuration almost every operator actually uses. The Animation panel
 * now registers it too, so the replay works with either canvas; this counter
 * keeps the two registrations from stacking into a double replay.
 */
let replayListenerRefCount = 0;
let replayListenerCleanup: (() => void) | null = null;

export function registerCanvasAnimationReplayListener(): () => void {
  if (typeof document === "undefined") return () => {};
  if (replayListenerCleanup) {
    replayListenerRefCount += 1;
    return () => {
      replayListenerRefCount -= 1;
      if (replayListenerRefCount <= 0) {
        replayListenerCleanup?.();
        replayListenerCleanup = null;
        replayListenerRefCount = 0;
      }
    };
  }

  function onReplay(evt: Event) {
    // Accept both the CustomEvent (desktop path) and a MessageEvent
    // (iframe child path, handled in IframeBridgeChild separately).
    const payload: ReplayAnimationMessage | null = (() => {
      if (evt instanceof CustomEvent) {
        return evt.detail as ReplayAnimationMessage;
      }
      return null;
    })();

    if (!payload) return;

    performAnimationReplay(payload.sectionId, payload.builderNodeId);
  }

  document.addEventListener("editor:replayAnimation", onReplay);
  replayListenerRefCount = 1;
  replayListenerCleanup = () =>
    document.removeEventListener("editor:replayAnimation", onReplay);
  return () => {
    replayListenerRefCount -= 1;
    if (replayListenerRefCount <= 0) {
      replayListenerCleanup?.();
      replayListenerCleanup = null;
      replayListenerRefCount = 0;
    }
  };
}

/**
 * The replay mechanic itself. Finds the target element, strips its
 * animation, then re-applies after a rAF so the browser restarts the
 * keyframe from scratch.
 *
 * For section-level animations (`data-section-anim-entry`), we target
 * the section root ([data-cms-section][data-section-id="…"]).
 * For node-level animations (`animation` inline style / `bn-anim-*`
 * keyframes), we target [data-builder-node-id="…"].
 */
export function performAnimationReplay(
  sectionId: string | null | undefined,
  builderNodeId: string | null | undefined,
): void {
  if (typeof document === "undefined") return;

  // Reduced-motion: skip unless the section explicitly opted into "always".
  const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (builderNodeId) {
    const el = document.querySelector<HTMLElement>(
      `[data-builder-node-id="${CSS.escape(builderNodeId)}"]`,
    );
    if (!el) return;
    if (prefersReducedMotion) return;

    replayInlineAnimation(el);
    return;
  }

  if (sectionId) {
    const el = document.querySelector<HTMLElement>(
      `[data-cms-section][data-section-id="${CSS.escape(sectionId)}"]`,
    );
    if (!el) return;

    const reducedMotionAlways =
      el.getAttribute("data-section-anim-reduced-motion") === "always";
    if (prefersReducedMotion && !reducedMotionAlways) return;

    replaySectionAnimation(el);
  }
}

/**
 * Replay the CSS `animation` on a builder node element.
 * We clone the inline animation value, remove it, force a reflow,
 * then restore — this causes the browser to restart the keyframe.
 *
 * TWO of the four trigger lanes ("on hover", "on scroll + just once") publish
 * their shorthand as the custom property `--bn-anim` instead of an inline
 * `animation`, precisely so it does NOT run at load. For those, "replay" means
 * play the shorthand once transiently and then take it off again — otherwise
 * the Play button and the on-apply replay are silent no-ops on exactly the
 * lanes whose published behaviour the operator can least preview by reloading.
 */
function replayInlineAnimation(el: HTMLElement): void {
  const prev = el.style.animation;
  if (!prev) {
    const viaProperty = el.style.getPropertyValue("--bn-anim").trim();
    if (!viaProperty) return;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      el.style.removeProperty("animation");
      el.removeEventListener("animationend", cleanup);
    };
    el.style.animation = viaProperty;
    el.addEventListener("animationend", cleanup);
    // Backstop for interrupted / never-firing animationend (display:none mid-
    // play, reduced-motion race): 4s comfortably outlives the 2.5s max the
    // panel's slider can set plus the longest delay chip.
    setTimeout(cleanup, 4000);
    return;
  }

  el.style.animation = "none";
  // Force reflow so the browser registers the removal.
  void el.offsetWidth; // eslint-disable-line @typescript-eslint/no-unused-expressions
  // Restore on the next rAF so the class-add lands in a fresh frame.
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    el.style.animation = prev;
  };
  requestAnimationFrame(restore);
  // rAF does not fire in a backgrounded / throttled tab. Without this the node
  // would keep `animation:none` until the tab came back -- visible and at rest,
  // so nothing breaks, but the animation would be silently lost from the
  // element. The timeout restores it either way; whichever lands first wins.
  setTimeout(restore, 50);
}

/**
 * Replay the data-section-anim-entry animation on a section element.
 * The CSS for these animations targets the `[data-section-anim-entry="..."]`
 * attr via the static sheet — we briefly remove it then re-add it.
 *
 * We also replay scroll-reveal by toggling the `data-revealed` attr that
 * scroll-reveal.ts sets, so the operator can see the reveal motion too.
 */
function replaySectionAnimation(el: HTMLElement): void {
  // Entry animation (attr-based).
  const entry = el.getAttribute("data-section-anim-entry");
  if (entry) {
    el.removeAttribute("data-section-anim-entry");
    void el.offsetWidth; // force reflow
    requestAnimationFrame(() => {
      el.setAttribute("data-section-anim-entry", entry);
    });
  }

  // Scroll-reveal: reset the `data-revealed` attr so the reveal fires again.
  if (el.hasAttribute("data-scroll-reveal")) {
    el.removeAttribute("data-revealed");
    void el.offsetWidth;
    // The IntersectionObserver that scroll-reveal.ts set up will re-fire,
    // but only if the element is in view. Force the trigger directly:
    requestAnimationFrame(() => {
      el.setAttribute("data-revealed", "1");
    });
  }
}
