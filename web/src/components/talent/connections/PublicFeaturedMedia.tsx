import { safeEmbedUrl } from "@/lib/talent-integrations/media-embed";

export type PublicFeaturedMediaItem = {
  id: string;
  provider: string;
  externalItemId: string;
  title: string | null;
};

/**
 * Renders talent-selected featured media as safe, sandboxed iframes.
 *
 * SECURITY: the iframe `src` is ALWAYS rebuilt from { provider, externalItemId }
 * through `safeEmbedUrl`, never from a stored embed string. Items whose provider
 * is unknown or whose id fails validation are skipped entirely. No raw HTML is
 * rendered. Frame hosts must be present in next.config.ts frame-src.
 *
 * These are manual showcase items — NOT verification badges.
 */
export function PublicFeaturedMedia({
  items,
  heading,
}: {
  items: PublicFeaturedMediaItem[];
  heading: string;
}) {
  const safe = items
    .map((item) => {
      const src = safeEmbedUrl(item.provider, item.externalItemId);
      return src ? { item, src } : null;
    })
    .filter((value): value is { item: PublicFeaturedMediaItem; src: string } =>
      Boolean(value),
    );

  if (safe.length === 0) return null;

  return (
    <section aria-labelledby="featured-media-heading" data-profile-section="featured-media">
      <h2
        id="featured-media-heading"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--impronta-muted)]"
      >
        {heading}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {safe.map(({ item, src }) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]"
          >
            <div className="relative aspect-video w-full">
              <iframe
                src={src}
                title={item.title || "Featured media"}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            {item.title ? (
              <p className="px-3 py-2 text-sm text-foreground">{item.title}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
