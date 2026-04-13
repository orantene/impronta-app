import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

export type LocationItem = {
  id: string;
  citySlug: string;
  displayName: string;
  countryCode: string;
  talentCount: number;
};

export type LocationSectionCopy = {
  sectionKicker: string;
  sectionTitle: string;
  talentCountOne: string;
  talentCountMany: string;
};

export function LocationSection({
  locations,
  locale,
  copy,
}: {
  locations: LocationItem[];
  locale: Locale;
  copy: LocationSectionCopy;
}) {
  if (locations.length === 0) return null;

  return (
    <section className="w-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {copy.sectionKicker}
        </h2>
        <p className="mt-2 text-center text-2xl font-light tracking-wide text-foreground sm:text-3xl">
          {copy.sectionTitle}
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {locations.map((loc) => (
            <Link
              key={loc.id}
              href={withLocalePath(`/directory?location=${loc.citySlug}`, locale)}
              className="group flex items-center gap-3 rounded-xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-6 py-4 transition-all hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5"
            >
              <MapPin className="size-5 text-[var(--impronta-gold)]" />
              <div>
                <span className="block text-m font-medium text-foreground transition-colors group-hover:text-[var(--impronta-gold)]">
                  {loc.displayName}
                </span>
                <span className="text-sm text-[var(--impronta-muted)]">
                  {loc.talentCount === 1
                    ? copy.talentCountOne
                    : copy.talentCountMany.replace("{count}", String(loc.talentCount))}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
