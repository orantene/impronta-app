import Link from "next/link";

import { rosterRequestHref } from "@/lib/service-hub/roster-request";
import { rosterServicesToCatalog } from "@/lib/service-hub/roster-catalog";
import type { RosterServiceItem } from "@/lib/service-hub/roster-services";

/**
 * TUL-1372: the workspace's roster services on /book. REQUEST-ONLY until the
 * listing checkout reader exists: each entry shows its price (or "from") and a
 * Request link to the workspace contact form with the service and talent in the
 * message. No checkout, no pay button.
 */
export function RosterRequestList({
  items,
  contactHref,
  locale,
  copy,
}: {
  items: readonly RosterServiceItem[];
  contactHref: string;
  locale: string;
  copy: { heading: string; request: string; note: string };
}) {
  if (items.length === 0) return null;
  const priced = rosterServicesToCatalog(items, locale);
  return (
    <section className="mt-12" data-roster-requests="">
      <h2 className="text-lg font-semibold tracking-tight">{copy.heading}</h2>
      <p className="mt-1 text-sm text-[var(--token-color-muted,rgba(11,11,13,0.62))]">{copy.note}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={item.listingId} className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(24,24,27,0.12)] px-4 py-3" data-roster-request="">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <p className="text-sm tabular-nums text-[var(--token-color-muted,rgba(11,11,13,0.62))]">
                {item.talentName ? `${item.talentName} · ` : ""}
                {priced[i]?.price}
              </p>
            </div>
            <Link
              href={rosterRequestHref(contactHref, item, locale)}
              className="shrink-0 rounded-lg border border-[rgba(24,24,27,0.12)] px-3 py-2 text-sm font-medium"
            >
              {copy.request}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
