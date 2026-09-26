/**
 * FAQ bind helpers (W16) — accordion `bindSource: "talent_faq_items"`.
 * Pure: expand published FAQ rows into accordion_item nodes at render time.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

export const FAQ_BIND_SOURCE = "talent_faq_items" as const;

export type TalentFaqItemRow = {
  id: string;
  question: string;
  answer: string;
  sort_order?: number;
};

export function accordionBindsFaq(
  props: { bindSource?: string } | null | undefined,
): boolean {
  return props?.bindSource === FAQ_BIND_SOURCE;
}

/** Build accordion_item children from FAQ entity rows (published). */
export function faqItemsToAccordionChildren(
  items: readonly TalentFaqItemRow[],
  idPrefix = "faq",
): BuilderNode[] {
  return items.map((item, index) => {
    const id = `${idPrefix}-${item.id || index}`;
    const answer = item.answer?.trim() || "";
    return {
      id,
      kind: "accordion_item" as const,
      props: { title: item.question.trim() || "…" },
      children: answer
        ? [
            {
              id: `${id}-a`,
              kind: "paragraph" as const,
              props: { text: answer, style: { tone: "muted", size: "md" } },
            },
          ]
        : [],
    } as BuilderNode;
  });
}

/**
 * Resolve children for a FAQ-bound accordion.
 * Prefer live FAQ rows; fall back to authored children (editor placeholders).
 */
export function resolveFaqAccordionChildren(
  authored: ReadonlyArray<BuilderNode> | undefined,
  items: readonly TalentFaqItemRow[] | undefined,
  idPrefix?: string,
): BuilderNode[] {
  if (items && items.length > 0) {
    return faqItemsToAccordionChildren(items, idPrefix);
  }
  return authored ? [...authored] : [];
}
