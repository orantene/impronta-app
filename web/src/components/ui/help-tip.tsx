"use client";

import { Info } from "lucide-react";
import { useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Icon-only help trigger. Uses TooltipTrigger + buttonVariants (not Button + asChild) so SSR HTML
 * matches the client and Radix Slot composition does not hydrate-mismatch.
 */
export function HelpTip({
  content,
  label = "More info",
  className,
}: {
  content: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const allowOpenRef = useRef(false);

  return (
    <TooltipProvider>
      <Tooltip
        delayDuration={250}
        open={open}
        onOpenChange={(next) => {
          if (next && !allowOpenRef.current) return;
          setOpen(next);
          if (!next) allowOpenRef.current = false;
        }}
      >
        <TooltipTrigger
          type="button"
          aria-label={label}
          onPointerDown={() => {
            allowOpenRef.current = true;
          }}
          onMouseEnter={() => {
            allowOpenRef.current = true;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") allowOpenRef.current = true;
          }}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "h-7 w-7 text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <Info className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="top">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
