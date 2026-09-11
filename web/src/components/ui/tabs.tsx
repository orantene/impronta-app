"use client";

/**
 * Tabs — the primitive the roughly one hundred operational screens in the 2026
 * blueprints assume exists and did not.
 *
 * WHY RADIX AND NOT A PAIR OF BUTTONS. Every hand-rolled tab strip in this repo
 * is a row of buttons and a `useState`, and every one of them is inaccessible
 * in the same way: no `role="tablist"`, no arrow-key roving focus, no
 * `aria-controls`, and a panel that is unreachable from the keyboard once you
 * tab past the strip. Those are not polish items — a staff member running a
 * shift on a tablet with a bluetooth keyboard cannot use a tab strip that has
 * no arrow-key behaviour. Radix already implements the WAI-ARIA tabs pattern,
 * including the automatic-versus-manual activation distinction below.
 *
 * ACTIVATION IS MANUAL BY DEFAULT, WHICH IS A DELIBERATE DEPARTURE FROM RADIX.
 * Radix defaults to `automatic`: moving focus with an arrow key selects the
 * tab. That is correct for cheap, local panels and wrong for most of ours,
 * where selecting a tab fires a server fetch — arrowing from the first tab to
 * the fourth would start three requests nobody asked for and, on a slow
 * connection, land the operator on whichever one resolved last. Manual
 * activation moves focus and waits for Enter or Space.
 */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

export const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ activationMode = "manual", ...props }, ref) => (
  <TabsPrimitive.Root ref={ref} activationMode={activationMode} {...props} />
));
Tabs.displayName = "Tabs";

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-background data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
