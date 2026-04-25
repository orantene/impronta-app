import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_POPOVER_CONTENT_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

/**
 * AdminHelpPopover — "?" icon helper used in list-page headers.
 *
 * Replaces the hand-rolled "How it works" popovers that lived inline on
 * /admin/inquiries, /admin/bookings, /admin/clients. One trigger, one content
 * shell, one icon. Content is whatever you pass — usually a `<ul>` of bullets.
 *
 *   <AdminHelpPopover title="Intake pipeline">
 *     <li>Each row is a lead — not confirmed work yet.</li>
 *     <li>Preview without leaving the list, or open the full page.</li>
 *   </AdminHelpPopover>
 *
 * Pass `label` to override the trigger text (defaults to "How it works").
 */
export function AdminHelpPopover({
  title,
  children,
  label = "How it works",
  align = "end",
}: {
  /** Headline shown at the top of the popover body. */
  title: ReactNode;
  /** List items or paragraphs explaining the surface. */
  children: ReactNode;
  /** Trigger button text. Defaults to "How it works". */
  label?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          ADMIN_HELP_TRIGGER_BUTTON,
        )}
      >
        <HelpCircle
          className="size-4 text-[var(--impronta-gold)]"
          aria-hidden
        />
        {label}
      </PopoverTrigger>
      <PopoverContent align={align} className={ADMIN_POPOVER_CONTENT_CLASS}>
        <div className="space-y-2">
          <p className="font-display text-sm font-medium text-foreground">
            {title}
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            {children}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
