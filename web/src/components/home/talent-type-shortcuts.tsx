import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import {
  Sparkles,
  Star,
  Mic2,
  Users,
  Music,
} from "lucide-react";

type TalentTypeShortcut = {
  slug: string;
  label: string;
  icon: React.ReactNode;
  taxId: string;
  imageUrl: string | null;
};

export function TalentTypeShortcuts({
  types,
  locale,
  sectionKicker,
}: {
  types: { id: string; slug: string; name: string; imageUrl?: string | null }[];
  locale: Locale;
  sectionKicker: string;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    model: <Sparkles className="size-5" />,
    hostess: <Star className="size-5" />,
    "promotional-model": <Users className="size-5" />,
    "brand-ambassador": <Mic2 className="size-5" />,
    dancer: <Music className="size-5" />,
  };

  const shortcuts: TalentTypeShortcut[] = types.map((t) => ({
    slug: t.slug,
    label: t.name,
    icon: iconMap[t.slug] ?? <Sparkles className="size-5" />,
    taxId: t.id,
    imageUrl: t.imageUrl ?? null,
  }));

  if (shortcuts.length === 0) return null;

  return (
    <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {sectionKicker}
        </h2>
        {/* Horizontal scroll on mobile, wrap on desktop */}
        <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:overflow-x-visible sm:px-0 sm:pb-0">
          <div className="flex w-max gap-3 sm:w-auto sm:flex-wrap sm:justify-center sm:gap-4">
            {shortcuts.map((s) => (
              <Link
                key={s.slug}
                href={withLocalePath(`/directory?tax=${s.taxId}`, locale)}
                className="group flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-5 py-2.5 text-m font-medium text-[var(--impronta-foreground)] transition-all hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5 hover:text-[var(--impronta-gold)]"
              >
                {s.imageUrl ? (
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--impronta-gold-border)] transition-opacity group-hover:opacity-95">
                    <Image
                      src={s.imageUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="size-full object-cover"
                      sizes="32px"
                    />
                  </span>
                ) : (
                  <span className="text-[var(--impronta-gold-dim)] transition-colors group-hover:text-[var(--impronta-gold)]">
                    {s.icon}
                  </span>
                )}
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
