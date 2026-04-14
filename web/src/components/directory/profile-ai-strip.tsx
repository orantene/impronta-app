"use client";

import { AIErrorBoundary } from "@/components/ai/ai-error-boundary";
import { AIPanel } from "@/components/ai/ai-panel";

type Props = { title: string; body: string };

/** Public profile attach point for AI (Phase 8.8). */
export function ProfileAiStrip({ title, body }: Props) {
  return (
    <AIErrorBoundary>
      <AIPanel title={title} variant="inline" className="mb-8">
        <p>{body}</p>
      </AIPanel>
    </AIErrorBoundary>
  );
}
