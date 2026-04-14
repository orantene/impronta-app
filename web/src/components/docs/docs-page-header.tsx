import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DocsPageHeader({
  eyebrow = "Documentation",
  title,
  description,
  search,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  search?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "rounded-xl border border-border/60 bg-card/50 px-5 py-5 shadow-sm sm:px-6",
        className,
      )}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
          <h1 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
      {search ? <div className="mt-5 border-t border-border/50 pt-4">{search}</div> : null}
    </header>
  );
}
