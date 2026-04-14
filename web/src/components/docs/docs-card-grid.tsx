import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type DocsCardItem = {
  title: string;
  description: string;
  href: string;
  /** Used with docs search scope filters. */
  kind?: "section" | "table" | "content";
};

export function DocsCardGrid({ cards, className }: { cards: DocsCardItem[]; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          data-docs-card
          data-kind={card.kind ?? "content"}
          className="group flex flex-col rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm transition-all duration-200 hover:border-[var(--impronta-gold-border)]/50 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{card.title}</h3>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{card.description}</p>
        </Link>
      ))}
    </div>
  );
}
