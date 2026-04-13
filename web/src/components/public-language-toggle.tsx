"use client";

import { useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded px-2 py-0.5 transition-colors no-underline inline-flex items-center";

/**
 * EN | ES — uses real paths from the server (`pathnameWithoutLocale`) and plain `<a>`
 * so each switch is a full navigation. `next/link` + `usePathname()` breaks under `/es`
 * rewrites: pathname looks like `/` while the address bar is `/es`, so Link to `/` is a no-op.
 */
export function PublicLanguageToggle({
  className,
  activeLocale,
  pathnameWithoutLocale,
}: {
  className?: string;
  activeLocale: Locale;
  pathnameWithoutLocale: string;
}) {
  const search = useSearchParams();
  const qs = search?.toString();
  const suffix = qs ? `?${qs}` : "";
  const enHref = `${withLocalePath(pathnameWithoutLocale, "en")}${suffix}`;
  const esHref = `${withLocalePath(pathnameWithoutLocale, "es")}${suffix}`;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1 py-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      <a
        href={enHref}
        className={cn(
          linkClass,
          activeLocale === "en"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </a>
      <span className="text-border" aria-hidden>
        |
      </span>
      <a
        href={esHref}
        className={cn(
          linkClass,
          activeLocale === "es"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        ES
      </a>
    </div>
  );
}
