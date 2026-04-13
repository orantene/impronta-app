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
};

export function TalentTypeShortcuts({
  types,
  locale,
  sectionKicker,
}: {
  types: { id: string; slug: string; name: string }[];
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
  }));

  if (shortcuts.length === 0) return null;

  return (
    <section className="w-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {sectionKicker}
        </h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3 sm:gap-4">
          {shortcuts.map((s) => (
            <Link
              key={s.slug}
              href={withLocalePath(`/directory?tax=${s.taxId}`, locale)}
              className="group flex items-center gap-2.5 rounded-full border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-5 py-2.5 text-m font-medium text-[var(--impronta-foreground)] transition-all hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5 hover:text-[var(--impronta-gold)]"
            >
              <span className="text-[var(--impronta-gold-dim)] transition-colors group-hover:text-[var(--impronta-gold)]">
                {s.icon}
              </span>
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
