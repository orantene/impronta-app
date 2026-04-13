import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

export type FeaturedTalentCard = {
  id: string;
  profileCode: string;
  displayName: string;
  talentType: string;
  location: string;
  thumbnailUrl: string | null;
};

export type FeaturedTalentSectionCopy = {
  sectionKicker: string;
  sectionTitle: string;
  viewAll: string;
  viewAllMobile: string;
  brandPlaceholder: string;
};

export function FeaturedTalentSection({
  talent,
  locale,
  copy,
}: {
  talent: FeaturedTalentCard[];
  locale: Locale;
  copy: FeaturedTalentSectionCopy;
}) {
  if (talent.length === 0) return null;

  return (
    <section className="w-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
              {copy.sectionKicker}
            </h2>
            <p className="mt-2 text-2xl font-light tracking-wide text-foreground sm:text-3xl">
              {copy.sectionTitle}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="hidden text-[var(--impronta-muted)] hover:text-[var(--impronta-gold)] sm:flex" asChild>
            <Link href={withLocalePath("/directory?sort=featured", locale)}>
              {copy.viewAll} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {talent.map((t) => (
            <Link
              key={t.id}
              href={withLocalePath(`/t/${t.profileCode}`, locale)}
              className="group relative overflow-hidden rounded-lg bg-[var(--impronta-surface)]"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                {t.thumbnailUrl ? (
                  <Image
                    src={t.thumbnailUrl}
                    alt={t.displayName}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-sm tracking-[0.2em] text-[var(--impronta-muted)]">
                    {copy.brandPlaceholder}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </div>
              <div className="p-3 sm:p-4">
                <h3 className="truncate font-display text-m font-medium tracking-wide text-foreground transition-colors group-hover:text-[var(--impronta-gold)]">
                  {t.displayName}
                </h3>
                <p className="mt-0.5 truncate text-sm text-[var(--impronta-muted)]">
                  {t.talentType}
                  {t.location ? ` · ${t.location}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center sm:hidden">
          <Button variant="outline" size="sm" asChild>
            <Link href={withLocalePath("/directory?sort=featured", locale)}>
              {copy.viewAllMobile} <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
