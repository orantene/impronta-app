"use client";

import { cn } from "@/lib/utils";

export function DocsSidebarNav({
  title = "On this page",
  links,
  className,
}: {
  title?: string;
  links: Array<{ label: string; href: string }>;
  className?: string;
}) {
  return (
    <nav
      aria-label={title}
      className={cn(
        "hidden rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm xl:block xl:max-w-[13rem] xl:shrink-0",
        className,
      )}
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <ul className="space-y-1.5 text-xs">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="block rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-[var(--impronta-gold)]/[0.06] hover:text-foreground"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Mobile: horizontal chip strip; desktop hidden when using {@link DocsSidebarNav}. */
export function DocsSidebarNavMobile({
  title = "Jump to",
  links,
  className,
}: {
  title?: string;
  links: Array<{ label: string; href: string }>;
  className?: string;
}) {
  return (
    <div className={cn("xl:hidden", className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="snap-start whitespace-nowrap rounded-full border border-border/55 bg-card/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold-border)]/45 hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
