import type { LiveBookingSurface } from "./live-booking-markers";

/**
 * TUL-1613: the live booking band lives in its OWN module so the builder renderer (`render.tsx`),
 * which the admin builder canvas bundles, no longer reaches `BookPageClient` and the whole public
 * booking chain (DatedPlacesStep, slot picker, captcha...). Public server callers inject
 * `renderLiveBookingBand` through the renderer's options; a caller that does not (admin, previews,
 * tests) simply gets the authored fallback children for that band.
 */

/**
 * Async on purpose: the booking flow's client chain reaches `server-only`
 * modules, so it is imported lazily and only when a marked band renders. A
 * static import would put it in every consumer of the renderer (the perf
 * budget script, golden renders) for a band they never draw.
 *
 * TUL-452: isolate ink + overflow. Themed CMS pages often set light ink and
 * overflow:hidden on ancestors; slot buttons/fields then vanish on white, and
 * Turnstile's challenge expand is clipped (Confirm dead-ends with no widget).
 */
export async function LiveBookingBand({
  nodeId,
  surface,
  tenantId,
  locale,
}: {
  nodeId: string;
  surface: LiveBookingSurface;
  tenantId: string;
  locale?: string;
}) {
  const { BookPageClient } = await import("@/app/(public)/book/BookPageClient");
  return (
    <div
      data-builder-node-id={nodeId}
      data-builder-node-kind="container"
      data-live-booking=""
      style={{
        width: "100%",
        maxWidth: 640,
        margin: "0 auto",
        padding: "32px 16px",
        overflow: "visible",
        position: "relative",
        zIndex: 1,
        color: "var(--token-color-ink, #0B0B0D)",
        background: "var(--token-color-surface-raised, #ffffff)",
        borderRadius: 12,
      }}
    >
      <BookPageClient
        tenantSlug={surface.tenantSlug}
        tenantId={tenantId}
        agencyName={surface.agencyName}
        offerings={surface.offerings}
        signedIn={surface.signedIn}
        client={surface.client}
        captcha={surface.captcha}
        locale={locale}
      />
    </div>
  );
}


/** The injectable form: what a public server caller passes as `renderLiveBookingBand`. */
export function renderLiveBookingBand(args: { nodeId: string; surface: LiveBookingSurface; tenantId: string; locale?: string }) {
  return <LiveBookingBand {...args} />;
}
