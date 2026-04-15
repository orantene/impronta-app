"use client";

import { Info } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function AiSetupHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="How AI availability and providers work"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 text-muted-foreground hover:text-foreground",
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Availability vs provider</p>
          <p className="text-muted-foreground">
            Feature switches control what the product is allowed to do. Provider configuration supplies
            runtime API keys (platform env and/or agency encrypted keys). The directory, inquiries, and
            core workflows keep working when no provider is connected — only AI-backed stages are skipped.
          </p>
        </div>

        <div className="space-y-1">
          <p className="font-medium text-foreground">Where keys live</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>
              <strong className="text-foreground">Platform:</strong> host environment variables such as{" "}
              <code className="text-foreground">OPENAI_API_KEY</code> /{" "}
              <code className="text-foreground">ANTHROPIC_API_KEY</code>.
            </li>
            <li>
              <strong className="text-foreground">Agency:</strong> keys pasted in AI settings — stored
              encrypted at rest, never exposed to the browser after save.
            </li>
            <li>
              Credential resolution (inherit / platform / agency) is configured per tenant and per provider
              row.
            </li>
          </ul>
        </div>

        <div className="space-y-1">
          <p className="font-medium text-foreground">Safety</p>
          <p className="text-muted-foreground">
            Never put raw API keys in client-side code or public pages. Use server actions or server routes
            only.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
