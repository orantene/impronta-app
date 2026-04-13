"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

export type ClientPageHelp = {
  title: string;
  items: string[];
};

export function ClientPageHeader({
  title,
  subtitle,
  help,
}: {
  title: string;
  subtitle: string;
  help?: ClientPageHelp;
}) {
  return (
    <header className="min-w-0 border-b border-border/50 pb-6 sm:border-l-[3px] sm:border-l-[var(--impronta-gold)]/45 sm:pl-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1
            className={cn(
              ADMIN_SECTION_TITLE_CLASS,
              "text-lg tracking-tight text-foreground sm:text-xl",
            )}
          >
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {help ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-2 self-start border-border/60 bg-background/70"
              >
                <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
                How it works
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))]">
              <p className="text-sm font-medium text-foreground">{help.title}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                {help.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </header>
  );
}
