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
  | { type: "editor:scrollToSection"; sectionId: string };

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
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSelectedSectionId]);

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
 * so the InspectorDock + chip selection chrome stay in sync.
 */
export function IframeBridgeParent() {
  const {
    setSelectedSectionId,
    setHoveredSectionId,
  } = useEditContext();

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!isBridgeMessage(e.data)) return;
      const msg = e.data;

      if (msg.type === "editor:sectionClicked") {
        setSelectedSectionId(msg.sectionId);
        return;
      }

      if (msg.type === "editor:sectionHovered") {
        setHoveredSectionId(msg.sectionId);
        return;
      }

      // editor:ready — Sprint 3 just acknowledges receipt. Future
      // sprints might use this to flush a queue of pending parent →
      // child commands that arrived before the iframe hydrated.
      if (msg.type === "editor:ready") {
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSelectedSectionId, setHoveredSectionId]);

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
