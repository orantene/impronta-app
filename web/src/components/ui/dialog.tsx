"use client";

/**
 * Dialog — a centred modal, distinct from `Sheet`, which is the same Radix
 * primitive anchored to an edge.
 *
 * WHY BOTH EXIST. `Sheet` slides in from a side and is right for a workflow you
 * return from: edit this thing, keep the list behind it. A confirmation is not
 * that. "Cancel this event — 47 buyers will be refunded" has to interrupt, has
 * to be the only thing on screen, and has to be dismissed before anything else
 * happens. Building it as a side sheet leaves the list visible and clickable
 * behind it, which is precisely the affordance a destructive confirmation must
 * not have.
 *
 * THE TITLE IS NOT OPTIONAL AND THE COMPONENT SAYS SO IN ITS TYPE.
 * `DialogContent` requires a `title`, because Radix warns (and screen readers
 * announce nothing useful) without a `Dialog.Title`, and every hand-rolled
 * modal in this repo that forgot one is a modal that opens as an unnamed region
 * for anyone not looking at it. Making it a required prop rather than a
 * documented convention is the only version of that rule that survives.
 *
 * `destructive` DOES NOT MEAN RED. It removes the outside-click dismissal.
 * Clicking the scrim to close is a good default and a bad one for a
 * confirmation an operator reached by accident — the two-outcome dialog should
 * have exactly two outcomes, both of them chosen.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  /** Required: a modal with no accessible name is an unnamed region. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Removes scrim-click dismissal. For confirmations, not for editors. */
  destructive?: boolean;
  /** Hide the title visually while keeping it for assistive technology. */
  hideTitle?: boolean;
};

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, title, description, destructive, hideTitle, ...props },
    ref,
  ) => (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onPointerDownOutside={
          destructive ? (event) => event.preventDefault() : props.onPointerDownOutside
        }
        onInteractOutside={
          destructive ? (event) => event.preventDefault() : props.onInteractOutside
        }
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4",
          "rounded-xl border border-border/60 bg-popover p-6 text-popover-foreground shadow-lg",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1.5">
          <DialogPrimitive.Title
            className={cn(
              hideTitle ? "sr-only" : "font-display text-lg font-medium tracking-wide",
            )}
          >
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        {children}
        {/*
          The close affordance is always rendered, even when `destructive`
          suppresses the scrim click. Removing every dismissal would trap a
          keyboard user in a dialog they opened by mistake — Escape still
          works, and this is its visible equivalent.
        */}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
