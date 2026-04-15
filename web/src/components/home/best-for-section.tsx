"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
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
  showMore: string;
  showLess: string;
};

const COLLAPSED_LIMIT = 6;

export function BestForSection({
  labels,
  locale,
  copy,
}: {
  labels: FitLabelItem[];
  locale: Locale;
  copy: BestForSectionCopy;
}) {
  const [expanded, setExpanded] = useState(false);

  if (labels.length === 0) return null;

  const hasMore = labels.length > COLLAPSED_LIMIT;
  const visible = expanded ? labels : labels.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = labels.length - COLLAPSED_LIMIT;

  return (
    <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {copy.sectionKicker}
        </h2>
        <p className="mt-2 text-center text-2xl font-light tracking-wide text-foreground sm:text-3xl">
          {copy.sectionTitle}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((label) => (
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

        {hasMore ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-full border border-[var(--impronta-gold-border)] px-5 py-2 text-sm text-[var(--impronta-muted)] transition-all hover:border-[var(--impronta-gold)]/40 hover:text-[var(--impronta-gold)]"
            >
              {expanded ? (
                <>
                  {copy.showLess}
                  <ChevronUp className="size-4" />
                </>
              ) : (
                <>
                  {copy.showMore.replace("{count}", String(hiddenCount))}
                  <ChevronDown className="size-4" />
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
