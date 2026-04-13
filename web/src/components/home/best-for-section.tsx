import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

export type FitLabelItem = {
  id: string;
  slug: string;
  name: string;
};

export type BestForSectionCopy = {
  sectionKicker: string;
  sectionTitle: string;
};

export function BestForSection({
  labels,
  locale,
  copy,
}: {
  labels: FitLabelItem[];
  locale: Locale;
  copy: BestForSectionCopy;
}) {
  if (labels.length === 0) return null;

  return (
    <section className="w-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {copy.sectionKicker}
        </h2>
        <p className="mt-2 text-center text-2xl font-light tracking-wide text-foreground sm:text-3xl">
          {copy.sectionTitle}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((label) => (
            <Link
              key={label.id}
              href={withLocalePath(`/directory?tax=${label.id}`, locale)}
              className="group flex items-center justify-between rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-5 transition-all hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5"
            >
              <span className="text-m font-medium text-foreground transition-colors group-hover:text-[var(--impronta-gold)]">
                {label.name}
              </span>
              <ArrowRight className="size-4 text-[var(--impronta-gold-dim)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--impronta-gold)]" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
