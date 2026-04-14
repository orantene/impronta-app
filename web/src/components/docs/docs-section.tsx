import { cn } from "@/lib/utils";

import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";

export function DocsSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  /** Small uppercase label above title (e.g. control center). */
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      data-docs-section
      className={cn(
        "rounded-xl border border-border/60 bg-card/40 shadow-sm transition-[border-color,box-shadow] duration-200",
        "hover:border-[var(--impronta-gold-border)]/45 hover:shadow-[0_14px_36px_-26px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div className="border-b border-border/50 px-5 py-4 sm:px-6">
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2
          className={cn(
            "font-display text-sm font-semibold uppercase tracking-[0.18em] text-foreground",
            ADMIN_SECTION_TITLE_CLASS,
          )}
        >
          {title}
        </h2>
        {description ? <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        <div className="mt-4 h-px w-full bg-gradient-to-r from-[var(--impronta-gold)]/35 via-border/60 to-transparent" />
      </div>
      <div className={cn("px-5 py-4 sm:px-6 sm:py-5", bodyClassName)}>{children}</div>
    </section>
  );
}
