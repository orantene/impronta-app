"use client";

import { Icon } from "@/components/admin/shell/internal/primitives";
import type { PromoCopy, PromoCopyKey } from "@/lib/promos/copy/talent";
import { TEMPLATE_ICON, TEMPLATE_ORDER, type TemplateKey } from "@/lib/promos/templates";
import { UI } from "./ui";

/** Step 1 (D3): template tiles with icons, no form. Custom sits last, full width. */
export function TemplateGrid({ copy, onPick }: { copy: PromoCopy; onPick: (key: TemplateKey) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {TEMPLATE_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(key)}
          className={`${UI.card} flex min-h-[96px] flex-col items-start justify-between gap-2 p-3.5 text-left ${key === "custom" ? "col-span-2 min-h-[64px] flex-row items-center justify-start" : ""}`}
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--tc-soft,#e6f4f1)] text-[var(--tc-ink,#1c1c1e)]">
            <Icon name={TEMPLATE_ICON[key]} size={17} stroke={1.7} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`text-[14px] font-semibold ${UI.ink}`}>{copy.t(`tpl.${key}` as PromoCopyKey)}</span>
            {key === "custom" ? null : (
              <span className={`line-clamp-2 text-[12px] leading-snug ${UI.muted}`}>{copy.t(`tpl.${key}.sub` as PromoCopyKey)}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
