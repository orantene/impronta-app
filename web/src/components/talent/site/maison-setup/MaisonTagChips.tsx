"use client";

import { MAISON_SEED } from "@/lib/talent-site/theme-catalog/maison/seed";
import { tagLabel, type MaisonSetupLocale } from "./maison-setup-copy";

type Tag = (typeof MAISON_SEED.theme.tags)[number];

/** Style = outlined; layout = filled (spec §12.4 / W26). */
export function MaisonTagChips({
  locale,
  tags = MAISON_SEED.theme.tags,
}: {
  locale: MaisonSetupLocale;
  tags?: readonly Tag[];
}) {
  return (
    <ul data-maison-tag-chips="" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {tags.map((tag) => {
        const style = tag.kind === "style";
        return (
          <li
            key={tag.key}
            data-maison-tag={tag.key}
            data-maison-tag-kind={tag.kind}
            className={
              style
                ? "rounded-full border border-admin-ink/25 bg-transparent px-2.5 py-0.5 text-[11.5px] font-semibold text-admin-ink"
                : "rounded-full border border-transparent bg-admin-ink px-2.5 py-0.5 text-[11.5px] font-semibold text-white"
            }
          >
            {tagLabel(locale, tag.key)}
          </li>
        );
      })}
    </ul>
  );
}

/** Assert helpers for static tests — keep kind mapping next to the chip. */
export function maisonTagKind(key: string): "style" | "layout" | null {
  const tag = MAISON_SEED.theme.tags.find((t) => t.key === key);
  if (!tag) return null;
  return tag.kind === "style" || tag.kind === "layout" ? tag.kind : null;
}

export function maisonTagChipClassHint(kind: "style" | "layout"): "outlined" | "filled" {
  return kind === "style" ? "outlined" : "filled";
}
