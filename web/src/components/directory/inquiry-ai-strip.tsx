"use client";

import { AIErrorBoundary } from "@/components/ai/ai-error-boundary";
import { AIPanel } from "@/components/ai/ai-panel";

type Props = { title: string; body: string };

/** Inquiry sheet attach point for AI drafting (Phase 8.8). */
export function InquiryAiStrip({ title, body }: Props) {
  return (
    <AIErrorBoundary>
      <AIPanel title={title} variant="compact" className="border-dashed border-border/60 bg-muted/5">
        <p>{body}</p>
      </AIPanel>
    </AIErrorBoundary>
  );
}
