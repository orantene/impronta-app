"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export function AiProviderSetupHelp({ kind }: { kind: "openai" | "anthropic" }) {
  if (kind === "openai") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs">
            <HelpCircle className="size-3.5" />
            OpenAI setup
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,26rem)] space-y-2 text-sm" align="start">
          <p className="font-medium text-foreground">Connect OpenAI</p>
          <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Create or sign in to an OpenAI Platform account.</li>
            <li>Add billing or prepaid credits so API calls can run.</li>
            <li>Create a project (recommended) and issue a project API key.</li>
            <li>Paste the key here and run Test connection.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Embeddings for semantic search also use this OpenAI key when enabled.
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs">
          <HelpCircle className="size-3.5" />
          Anthropic setup
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,26rem)] space-y-2 text-sm" align="start">
        <p className="font-medium text-foreground">Connect Anthropic</p>
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>Create an Anthropic Console account.</li>
          <li>Add billing so Claude API requests are allowed.</li>
          <li>Create an API key in the console.</li>
          <li>Paste the key here and run Test connection.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Chat/NLU can use Claude while embeddings remain on OpenAI when semantic search is enabled.
        </p>
      </PopoverContent>
    </Popover>
  );
}
