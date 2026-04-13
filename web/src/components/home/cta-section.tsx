import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";

export type CtaSectionCopy = {
  title: string;
  body: string;
  searchTalent: string;
  createAccount: string;
};

export function CtaSection({
  locale,
  copy,
}: {
  locale: Locale;
  copy: CtaSectionCopy;
}) {
  return (
    <section className="w-full px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-2xl font-normal tracking-wide text-foreground sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-4 text-base text-[var(--impronta-muted)]">{copy.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={withLocalePath("/directory", locale)}>{copy.searchTalent}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">{copy.createAccount}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
