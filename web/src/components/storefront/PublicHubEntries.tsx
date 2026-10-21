import Link from "next/link";

import { SmartImage } from "@/components/ui/smart-image";
import type { PublicEntry } from "@/lib/service-hub/public-hub";

const COPY = {
  es: { heading: "Servicios", request: "Solicitar", from: "Desde", with: "Con" },
  en: { heading: "Services", request: "Request", from: "From", with: "With" },
} as const;

function money(cents: number, currency: string | null, locale: "es" | "en"): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

/** The workspace's hub services, request-only (a visitor asks, never buys here). */
export function PublicHubEntries({
  entries,
  locale,
  requestHref = () => "/contact",
}: {
  entries: readonly PublicEntry[];
  locale: "es" | "en";
  requestHref?: (entry: PublicEntry) => string;
}) {
  if (entries.length === 0) return null;
  const t = COPY[locale];
  return (
    <section aria-labelledby="hub-services-h" data-testid="public-hub-entries" className="mx-auto max-w-5xl px-4 py-8">
      <h2 id="hub-services-h" className="text-xl font-semibold">{t.heading}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <li key={e.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            {e.photoUrl ? <SmartImage src={e.photoUrl} alt="" width={480} height={320} className="aspect-[3/2] w-full object-cover" /> : null}
            <div className="space-y-1 p-4">
              <h3 className="text-base font-medium">{e.name}</h3>
              {e.who.length > 0 ? <p className="text-sm text-muted-foreground">{t.with} {e.who.join(", ")}</p> : null}
              {e.priceCents != null ? <p className="text-sm">{e.from ? `${t.from} ` : ""}{money(e.priceCents, e.currency, locale)}</p> : null}
              <Link href={requestHref(e)} className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-foreground px-4 text-sm font-medium text-background">{t.request}</Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
