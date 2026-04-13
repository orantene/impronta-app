"use client";

import { Info } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_POPOVER_CONTENT_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * PopoverTrigger + buttonVariants (not Button + asChild) so SSR HTML matches the client —
 * Radix Slot composition with our Button forwardRef can otherwise hydrate-mismatch.
 */
export function AdminTalentHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          ADMIN_HELP_TRIGGER_BUTTON,
        )}
      >
        <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
        How it works
      </PopoverTrigger>
      <PopoverContent align="end" className={ADMIN_POPOVER_CONTENT_CLASS}>
        <div className="space-y-2">
          <p className="font-display text-sm font-medium text-foreground">Talent queue</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Use workflow tabs plus the media strip to focus on profiles that still have pending uploads.</li>
            <li>Select rows to run bulk approve, hide, feature, or soft-delete.</li>
            <li>⌘K jumps quickly; User search under Admin is for cross-role directory lookups.</li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
