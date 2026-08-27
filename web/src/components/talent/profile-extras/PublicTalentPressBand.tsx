import type { PublicTalentPressItem } from "@/lib/talent/profile-embeds/types";

/**
 * Pro/Portfolio press band on the public talent profile.
 *
 * SECURITY: `url` was normalized to an absolute http(s) URL at write time
 * (`normalizePressUrl`), re-checked in the repository read, and constrained by
 * a `url ~* '^https?://'` CHECK on the table — three layers, because a stored
 * `javascript:` string would otherwise be a live XSS sink in this anchor.
 * Outbound links carry rel="nofollow noopener noreferrer": these are talent-
 * supplied third-party links, so they must not pass ranking signal either.
 */
export function PublicTalentPressBand({
  items,
  heading,
}: {
  items: PublicTalentPressItem[];
  heading: string;
}) {
  const safe = items.filter((item) => /^https?:\/\//i.test(item.url));
  if (safe.length === 0) return null;

  return (
    <section aria-labelledby="talent-press-heading" data-profile-section="talent-press">
      {heading ? (
        <h2
          id="talent-press-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--impronta-muted)]"
        >
          {heading}
        </h2>
      ) : null}
      <ul className={heading ? "mt-4 grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2"}>
        {safe.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--impronta-muted)]">
                {item.outlet}
              </span>
              {item.publishedOn ? (
                <time
                  dateTime={item.publishedOn}
                  className="shrink-0 text-xs text-[var(--impronta-muted)]"
                >
                  {item.publishedOn}
                </time>
              ) : null}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="mt-1 block text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {item.title}
            </a>
            {item.quote ? (
              <blockquote className="mt-2 border-l-2 border-[var(--impronta-gold-border)] pl-3 text-sm italic text-[var(--impronta-muted)]">
                {item.quote}
              </blockquote>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
