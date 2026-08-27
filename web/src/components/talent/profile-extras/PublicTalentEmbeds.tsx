import type { PublicTalentEmbed } from "@/lib/talent/profile-embeds/types";

/**
 * Pro/Portfolio social + video embed band on the public talent profile.
 *
 * SECURITY: `src` arrives already re-minted by `profileEmbedIframeSrc` in the
 * repository — it is never a stored embed string and never operator text. Rows
 * whose provider or id no longer validate are dropped upstream, so anything
 * that reaches this component is on an allow-listed frame host. No raw HTML,
 * no dangerouslySetInnerHTML, no provider embed.js.
 *
 * Mirrors PublicFeaturedMedia's iframe hardening (sandbox + referrerPolicy).
 */
export function PublicTalentEmbeds({
  items,
  heading,
}: {
  items: PublicTalentEmbed[];
  heading: string;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="talent-embeds-heading" data-profile-section="talent-embeds">
      {heading ? (
        <h2
          id="talent-embeds-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--impronta-muted)]"
        >
          {heading}
        </h2>
      ) : null}
      <div className={heading ? "mt-4 grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
        {items.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]"
          >
            <div
              className={
                // Instagram and TikTok embeds are portrait; video/audio are not.
                item.provider === "instagram" || item.provider === "tiktok"
                  ? "relative aspect-[9/14] w-full"
                  : "relative aspect-video w-full"
              }
            >
              <iframe
                src={item.src}
                title={item.title || `${item.provider} embed`}
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
