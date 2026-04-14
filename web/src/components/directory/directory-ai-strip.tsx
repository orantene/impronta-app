"use client";

import { AIErrorBoundary } from "@/components/ai/ai-error-boundary";
import { AIPanel } from "@/components/ai/ai-panel";

type Props = {
  title: string;
  body: string;
};

/**
 * Directory attach point for AI (Phase 8.8). Wrapped so failures never white-screen the listing.
 */
export function DirectoryAiStrip({ title, body }: Props) {
  return (
    <AIErrorBoundary>
      <AIPanel title={title} variant="inline" className="mb-6">
        <p>{body}</p>
      </AIPanel>
    </AIErrorBoundary>
  );
}
