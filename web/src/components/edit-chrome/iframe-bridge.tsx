"use client";

/**
 * IframeBridge — Sprint 3 parent ↔ iframe-child postMessage protocol.
 *
 * The mobile/tablet device preview renders the storefront inside an
 * `<iframe>` whose viewport matches the device width. The iframe has
 * its own React tree + EditContext (it loaded a separate URL with
 * `?iframe=1`), so the parent's editor chrome (topbar, inspector,
 * drawers) and the iframe's storefront DOM need an explicit channel
 * to stay in sync.
 *
 * **Protocol — child → parent** (all messages namespaced
 * `editor:*`; ignored by anything not in this contract):
 *
 *   { type: "editor:sectionClicked", sectionId: string }
 *     Operator clicked a section inside the iframe. Parent should set
 *     `selectedSectionId` so InspectorDock opens with that section's
 *     fields.
 *
 *   { type: "editor:sectionHovered", sectionId: string | null }
 *     Operator's pointer entered/left a section inside the iframe.
 *     Parent updates `hoveredSectionId` for any cross-frame hover UI
 *     (Sprint 3 doesn't render parent-side hover chrome in iframe
 *     mode, but we forward the signal so future sprints can).
 *
 *   { type: "editor:ready" }
 *     Iframe finished mounting and is ready to receive messages.
 *     Parent can now safely send "editor:setSelection" etc. without
 *     the message landing before the listener attached.
 *
 * **Protocol — parent → child** (Sprint 3 keeps this minimal —
 * select-and-inspect only, per the locked scope):
 *
 *   { type: "editor:setSelection", sectionId: string | null }
 *     Parent wants to select a specific section inside the iframe
 *     (e.g., Sections panel click). Iframe updates its local
 *     `selectedSectionId` so the ring + chip render inside the
 *     device frame.
 *
 *   { type: "editor:scrollToSection", sectionId: string }
 *     Parent wants the iframe to scroll a section into view.
 *
 * Origin check: both halves verify message origin matches their own
 * `window.location.origin`. Cross-origin messages are silently
 * dropped (`.tulala.digital` storefront and editor share the same
 * origin in production; in dev both are on `localhost:3000`). No
 * pre-shared secret needed because we control both sides of the
 * conversation and the origin check is the security boundary.
 *
 * **Out of scope for Sprint 3**: drag-drop across the iframe
 * boundary, geometry forwarding for parent-rendered selection rings,
 * autosave-driven iframe re-render. Those are explicitly deferred to
 * Sprint 4+ per the Sprint 3 kickoff scope decision.
 */

import { useEffect, useRef } from "react";

import { useEditContext } from "./edit-context";

// Discriminated union of all bridge messages. Used as a runtime
// guard via the `type` string and as the typescript shape for
// senders/receivers.
type BridgeMessage =
  // child → parent
  | { type: "editor:sectionClicked"; sectionId: string }
  | { type: "editor:sectionHovered"; sectionId: string | null }
  | { type: "editor:ready" }
  // parent → child
  | { type: "editor:setSelection"; sectionId: string | null }
  | { type: "editor:scrollToSection"; sectionId: string }
  // parent → child — Preview toggle on the topbar. When previewing is
  // true the iframe should unmount its own SelectionLayer +
  // CanvasLinkInterceptor and set body[data-edit-preview="1"] so its
  // local affordances hide. The iframe has an independent EditContext
  // so we sync it explicitly rather than rely on a shared store.
  | { type: "editor:setPreviewing"; previewing: boolean };

const BRIDGE_NAMESPACE = "editor:";

function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (!data || typeof data !== "object") return false;
  const t = (data as { type?: unknown }).type;
  return typeof t === "string" && t.startsWith(BRIDGE_NAMESPACE);
}

// ── Child (inside iframe) ─────────────────────────────────────────────────

/**
 * Mounted inside the iframe. Watches local EditContext for selection
 * + hover changes, posts them up to the parent. Also listens for
 * `setSelection` / `scrollToSection` from the parent and applies
 * them locally.
 */
export function IframeBridgeChild() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    hoveredSectionId,
    setPreviewing,
  } = useEditContext();
  // Track the last value we posted so we don't echo back a parent-
  // originated update as a "child clicked" event (which would loop).
  const lastPostedSelectionRef = useRef<string | null | undefined>(undefined);
  const lastPostedHoverRef = useRef<string | null | undefined>(undefined);
  const readySentRef = useRef(false);

  // Notify parent on every selection change. The parent's IframeBridgeParent
  // will set its own selectedSectionId — that's how the inspector dock opens.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return; // Not actually in an iframe.
    if (lastPostedSelectionRef.current === selectedSectionId) return;
    lastPostedSelectionRef.current = selectedSectionId;
    if (selectedSectionId) {
      const msg: BridgeMessage = {
        type: "editor:sectionClicked",
        sectionId: selectedSectionId,
      };
      window.parent.postMessage(msg, window.location.origin);
    }
  }, [selectedSectionId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    if (lastPostedHoverRef.current === hoveredSectionId) return;
    lastPostedHoverRef.current = hoveredSectionId;
    const msg: BridgeMessage = {
      type: "editor:sectionHovered",
      sectionId: hoveredSectionId ?? null,
    };
    window.parent.postMessage(msg, window.location.origin);
  }, [hoveredSectionId]);

  // Listen for parent-originated commands.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    function onMessage(e: MessageEvent) {
      // Origin guard: drop anything not from our own origin.
      if (e.origin !== window.location.origin) return;
      if (!isBridgeMessage(e.data)) return;
      const msg = e.data;

      if (msg.type === "editor:setSelection") {
        // Update local selection. Track the parent-originated value so
        // our outbound selection effect doesn't echo it back.
        lastPostedSelectionRef.current = msg.sectionId;
        setSelectedSectionId(msg.sectionId);
        return;
      }

      if (msg.type === "editor:scrollToSection") {
        const el = document.querySelector(
          `[data-cms-section][data-section-id="${CSS.escape(msg.sectionId)}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      if (msg.type === "editor:setPreviewing") {
        setPreviewing(msg.previewing);
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSelectedSectionId, setPreviewing]);

  // Announce readiness exactly once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;
    if (readySentRef.current) return;
    readySentRef.current = true;
    const msg: BridgeMessage = { type: "editor:ready" };
    window.parent.postMessage(msg, window.location.origin);
  }, []);

  return null;
}

// ── Parent (host page, EditShell) ─────────────────────────────────────────

/**
 * Mounted in EditShell when device != desktop. Listens for messages
 * from the child iframe and dispatches into the parent's EditContext
 * so the InspectorDock + chip selection chrome stay in sync. Also
 * forwards selection changes the OTHER direction — when the operator
 * picked a section on desktop and then switched to tablet/mobile, the
 * iframe needs to know to highlight + scroll to that section.
 */
export function IframeBridgeParent() {
  const {
    selectedSectionId,
    setSelectedSectionId,
    setHoveredSectionId,
    device,
    previewing,
  } = useEditContext();

  // Track the last selection we POSTED to the iframe so we don't echo
  // a child-originated selection back as a parent-driven setSelection
  // (which would loop). Also track iframe-ready handshake.
  const lastPostedSelectionRef = useRef<string | null | undefined>(undefined);
  const iframeReadyRef = useRef(false);

  // Helper: post to the iframe's contentWindow if it's mounted.
  function postToIframe(msg: BridgeMessage) {
    if (typeof document === "undefined") return;
    const iframe = document.querySelector<HTMLIFrameElement>(
      "[data-edit-iframe-host] iframe",
    );
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(msg, window.location.origin);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!isBridgeMessage(e.data)) return;
      const msg = e.data;

      if (msg.type === "editor:sectionClicked") {
        // Mark this as the last "known" selection so our outbound
        // selection effect doesn't echo it back to the iframe.
        lastPostedSelectionRef.current = msg.sectionId;
        setSelectedSectionId(msg.sectionId);
        return;
      }

      if (msg.type === "editor:sectionHovered") {
        setHoveredSectionId(msg.sectionId);
        return;
      }

      if (msg.type === "editor:ready") {
        // Sprint 3.x — handshake. Once the iframe announces ready, push
        // the parent's current selection so the iframe highlights the
        // section the operator was working on before switching device.
        // Also auto-scroll the iframe so that section is visible.
        iframeReadyRef.current = true;
        // Sync the Preview toggle FIRST so the iframe doesn't briefly
        // show editing chrome before suppressing it.
        postToIframe({ type: "editor:setPreviewing", previewing });
        if (selectedSectionId) {
          lastPostedSelectionRef.current = selectedSectionId;
          postToIframe({
            type: "editor:setSelection",
            sectionId: selectedSectionId,
          });
          postToIframe({
            type: "editor:scrollToSection",
            sectionId: selectedSectionId,
          });
        }
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedSectionId, setHoveredSectionId]);

  // Sprint 3.x — when the parent's selection changes (e.g. operator
  // picked a section in the navigator while iframe is up), push it
  // into the iframe so the ring + chip render at the iframe-local
  // coordinates of that section, and scroll it into view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!iframeReadyRef.current) return;
    // Skip when our local state was just updated FROM an iframe message
    // (lastPostedSelectionRef was synced in onMessage).
    if (lastPostedSelectionRef.current === selectedSectionId) return;
    lastPostedSelectionRef.current = selectedSectionId;
    postToIframe({
      type: "editor:setSelection",
      sectionId: selectedSectionId,
    });
    if (selectedSectionId) {
      postToIframe({
        type: "editor:scrollToSection",
        sectionId: selectedSectionId,
      });
    }
  }, [selectedSectionId]);

  // Push Preview toggle changes into the iframe so its local
  // SelectionLayer + CanvasLinkInterceptor can unmount in lockstep
  // with the parent. Suppression is symmetric: when the operator flips
  // the topbar pill, both sides hide affordances simultaneously.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!iframeReadyRef.current) return;
    postToIframe({ type: "editor:setPreviewing", previewing });
  }, [previewing]);

  // When the device toggle flips back to desktop the iframe unmounts;
  // reset the ready handshake so the next mount re-syncs cleanly.
  useEffect(() => {
    if (device === "desktop") {
      iframeReadyRef.current = false;
      lastPostedSelectionRef.current = undefined;
    }
  }, [device]);

  return null;
}

/**
 * Helper for parent code that wants to push a selection or scroll
 * into the iframe (e.g., Sections panel clicks selecting a section
 * by id without the operator clicking inside the iframe). The parent
 * looks up the active iframe via `data-edit-iframe-host iframe` and
 * posts to its `contentWindow`.
 */
export function postToActiveIframe(msg: BridgeMessage): boolean {
  if (typeof document === "undefined") return false;
  const iframe = document.querySelector<HTMLIFrameElement>(
    "[data-edit-iframe-host] iframe",
  );
  if (!iframe || !iframe.contentWindow) return false;
  iframe.contentWindow.postMessage(msg, window.location.origin);
  return true;
}
