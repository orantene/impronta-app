/**
 * post-faq-jsonld.ts — one schema.org FAQPage for all FAQ blocks of a post.
 *
 * TODO(TUL-795): switch to the shared FAQPage helper once PR #3743 merges.
 * The signature is deliberately narrow (blocks in, plain object or null out)
 * so the swap is a one-line change at the call site.
 */
import type { PostBlock } from "./post-blocks";

export type FaqPageJsonLd = {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
};

export function buildFaqPageJsonLd(blocks: readonly PostBlock[]): FaqPageJsonLd | null {
  const mainEntity: FaqPageJsonLd["mainEntity"] = [];
  for (const b of blocks) {
    if (b.type !== "faq") continue;
    const name = b.question.trim();
    const text = b.answer.trim();
    if (!name || !text) continue;
    mainEntity.push({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    });
  }
  if (mainEntity.length === 0) return null;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity };
}
