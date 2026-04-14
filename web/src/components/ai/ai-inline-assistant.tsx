"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { InlineToolbar } from "@/components/ui/inline-toolbar";
import { AIActionButton } from "@/components/ai/ai-action-button";
import { cn } from "@/lib/utils";

type AIInlineAssistantProps = {
  className?: string;
  /** Slot for future: generate, rewrite, insert — wired in Phase 13. */
  children?: React.ReactNode;
};

export function AIInlineAssistant({ className, children }: AIInlineAssistantProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("space-y-2", className)}>
      <AIActionButton
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? (
          <>
            Hide assistant <ChevronUp className="size-3" aria-hidden />
          </>
        ) : (
          <>
            AI assistant <ChevronDown className="size-3" aria-hidden />
          </>
        )}
      </AIActionButton>
      {open ? (
        <InlineToolbar className="w-full justify-start p-2">
          {children ?? (
            <span className="px-2 text-xs text-muted-foreground">
              Inline AI actions appear here when this surface wires an assistant.
            </span>
          )}
        </InlineToolbar>
      ) : null}
    </div>
  );
}
