"use client";

import { Icon } from "@/components/admin/shell/internal/primitives";
import type { PromoCopy } from "@/lib/promos/copy/talent";
import type { PromoListItem } from "@/lib/promos/actions";
import { progressOf } from "@/lib/promos/talent-view";
import { offerLabel, scheduleLine } from "./describe";
import { FOCUS, ProgressBar, StatusBadge, UI } from "./ui";

export function PromoCard({ item, copy, onOpen }: { item: PromoListItem; copy: PromoCopy; onOpen: () => void }) {
  const p = item.promo;
  const prog = progressOf(p, item.used);
  const usedText = prog.max === null
    ? copy.t("card.used_open", { used: prog.used })
    : copy.t("card.used", { used: prog.used, max: prog.max });
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${copy.t("card.open")}: ${item.name}`}
      className={`${UI.card} flex w-full flex-col gap-2 p-4 text-left transition-colors hover:border-[var(--tc-action,#0f766e)] ${FOCUS}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${UI.ink}`}>{item.name}</span>
        <span className="rounded-full bg-[var(--tc-soft,#e6f4f1)] px-2.5 py-1 text-[12px] font-semibold text-[var(--tc-ink,#1c1c1e)]">
          {offerLabel(p, copy)}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge status={item.status} copy={copy} />
        {item.is_trial ? <span className={`text-[12px] ${UI.muted}`}>{copy.t("card.trial")}</span> : null}
        {p.unlock === "code" && p.code ? <span className={`text-[12px] ${UI.muted}`}>{copy.t("card.code", { code: p.code })}</span> : null}
      </span>
      <span className={`text-[13px] ${UI.muted}`}>{scheduleLine(p, copy)}</span>
      {prog.max !== null ? <ProgressBar pct={prog.pct} label={usedText} /> : null}
      <span className="flex items-center justify-between">
        <span className={`text-[12px] ${UI.muted}`}>{usedText}</span>
        <Icon name="chevron-right" size={14} stroke={1.7} color="currentColor" />
      </span>
    </button>
  );
}
