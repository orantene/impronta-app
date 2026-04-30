"use client";

/**
 * IframeChild — Sprint 3 device-preview iframe surface.
 *
 * Mounted by EditChrome when the URL has `?iframe=1`. Replaces the
 * body-width-clip DeviceFrameStyle that Sprint 1's checkpoint
 * documented as fundamentally broken (CSS @media queries fire on
 * viewport, not body width; `position: fixed` content escapes the
 * body box).
 *
 * Inside the iframe we render:
 *   - the storefront DOM, full-bleed (no topbar gutter, no inspector
 *     gutter — there's no chrome here);
 *   - a minimal SelectionLayer so clicks inside the iframe still
 *     produce a hover ring + selection ring + chip at the section's
 *     iframe-local coordinates (the operator sees the ring inside
 *     the device frame, where they expect it);
 *   - the link interceptor so anchor clicks don't navigate;
 *   - an IframeBridgeChild that listens to local EditContext changes
 *     and posts them up to the parent via window.parent.postMessage.
 *
 * The parent receives those messages via IframeBridgeParent
 * (mounted in EditShell) and updates the parent's EditContext, which
 * drives the parent-side InspectorDock. Result:
 *   - operator clicks a section in the iframe → ring appears in
 *     iframe + inspector opens in the parent, both in sync.
 *
 * Sprint 3 explicitly does NOT support drag-drop across the iframe
 * boundary. The chip's drag handle stays mounted inside the iframe
 * but reorders within the iframe scroll. Cross-frame drag is a
 * Sprint 4+ concern.
 *
 * The auth cookie travels naturally — same origin, same SameSite=Lax
 * cookie. No extra plumbing needed.
 */

import { CanvasLinkInterceptor } from "./canvas-link-interceptor";
import { EditErrorBoundary } from "./edit-error-boundary";
import { EditProvider, useEditContext } from "./edit-context";
import { IframeBridgeChild } from "./iframe-bridge";
import { SelectionLayer } from "./selection-layer";

interface IframeChildProps {
  tenantId: string;
  locale?: string;
  pageSlug?: string | null;
  availableLocales?: ReadonlyArray<string>;
  initialComposition?: import("@/lib/site-admin/edit-mode/composition-actions").CompositionData | null;
}

export function IframeChild({
  tenantId,
  locale,
  pageSlug,
  availableLocales,
  initialComposition,
}: IframeChildProps) {
  return (
    <EditErrorBoundary>
      {/*
        Iframe-mode style overrides: undo the chrome-side `body { padding-top: 54px }`
        that EditChrome's shell branch SSRs in (we render the iframe BEFORE EditChrome's
        own check, so we have to inject zero-padding here). Also re-show the public
        header which the shell branch hid — the iframe IS the public storefront, the
        operator wants to see the header at the device width.
      */}
      <style>{`
        body { padding-top: 0 !important; padding-left: 0 !important; padding-right: 0 !important; max-width: none !important; margin: 0 !important; overflow-x: hidden !important; }
        header[data-public-header] { display: block !important; }
      `}</style>
      <EditProvider
        tenantId={tenantId}
        locale={locale}
        pageSlug={pageSlug}
        initialAvailableLocales={availableLocales}
        initialComposition={initialComposition}
      >
        {/* The storefront DOM is rendered by the host page (page.tsx →
            AgencyHomeStorefront). All we add here is the selection
            chrome + the bridge. */}
        <div data-edit-chrome style={{ display: "contents" }}>
          <div
            id="edit-overlay-portal"
            className="pointer-events-none fixed inset-0 z-[70]"
            aria-hidden
          />
          <IframeChromeOrPreview />
          <IframeBridgeChild />
        </div>
      </EditProvider>
    </EditErrorBoundary>
  );
}

/**
 * Inside the iframe, mount selection + link-interception chrome
 * unless the parent has flipped Preview on. The iframe's local
 * EditContext receives the previewing state via the bridge
 * (editor:setPreviewing message), and this component reads it to
 * decide whether to mount or hide.
 *
 * Lives outside <IframeChild> so it sits inside the EditProvider tree
 * (where useEditContext is allowed).
 */
function IframeChromeOrPreview() {
  const { previewing } = useEditContext();
  if (previewing) return null;
  return (
    <>
      <SelectionLayer />
      <CanvasLinkInterceptor />
    </>
  );
}
