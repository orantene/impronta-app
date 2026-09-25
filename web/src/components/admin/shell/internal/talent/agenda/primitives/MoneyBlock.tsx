"use client";

import type { AgendaMoneyItem } from "../types";

const TONE_CLASSNAME: Record<NonNullable<AgendaMoneyItem["tone"]>, string> = {
  default: "text-[var(--tc-primary)]",
  success: "text-[#1F5C42]",
  attention: "text-[#8A5A11]",
};

export function MoneyBlock({
  title = "Money",
  items,
}: {
  title?: string;
  items: AgendaMoneyItem[];
}) {
  return (
    <section className="rounded-[18px] border border-[rgba(11,11,13,0.10)] bg-white px-4 py-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const tone = item.tone ?? "default";
          return (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-[14px] border border-[rgba(11,11,13,0.08)] bg-[rgba(250,250,247,0.9)] px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--tc-primary)]">
                  {item.label}
                </div>
                {item.helper ? (
                  <div className="mt-1 text-[12px] text-[#5F6368]">{item.helper}</div>
                ) : null}
              </div>
              <div className={`shrink-0 text-[15px] font-semibold ${TONE_CLASSNAME[tone]}`}>
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
