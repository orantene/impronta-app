"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AIActionButtonProps = React.ComponentProps<typeof Button>;

export function AIActionButton({ className, children, ...props }: AIActionButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("gap-1.5 text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      <Sparkles className="size-3.5 opacity-70" aria-hidden />
      {children}
    </Button>
  );
}
