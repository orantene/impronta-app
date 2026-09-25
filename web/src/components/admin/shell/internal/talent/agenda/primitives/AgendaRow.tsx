"use client";

import { SecondaryButton } from "../../../primitives";
import { BookingStateChip } from "./BookingStateChip";
import { CountdownText } from "./CountdownText";
import { PaymentStateChip } from "./PaymentStateChip";
import type { AgendaRowItem } from "../types";

const VARIANT_CLASSNAME: Record<NonNullable<AgendaRowItem["variant"]>, string> = {
  default: "border-[rgba(11,11,13,0.10)] bg-white",
  request: "border-dashed border-[rgba(59,76,202,0.20)] bg-[rgba(59,76,202,0.03)]",
  hold: "border-[rgba(138,90,17,0.14)] bg-[rgba(138,90,17,0.05)]",
  block: "border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.04)]",
  agency: "border-[rgba(11,11,13,0.12)] bg-[rgba(11,11,13,0.02)]",
};

export function AgendaRow({ item }: { item: AgendaRowItem }) {
  const variant = item.variant ?? "default";
  const clickable = typeof item.onOpen === "function";

  return (
    <article
      className={`flex flex-col gap-3 rounded-[16px] border px-4 py-4 ${VARIANT_CLASSNAME[variant]} ${
        clickable ? "cursor-pointer transition-shadow hover:shadow-sm" : ""
      }`}
      onClick={item.onOpen}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                item.onOpen?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
            {item.timeLabel}
            {item.durationLabel ? ` · ${item.durationLabel}` : ""}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-[var(--tc-primary)]">
            {item.title}
          </div>
          {item.person ? (
            <div className="mt-1 text-[13px] text-[#5F6368]">{item.person}</div>
          ) : null}
        </div>
        {item.action?.label ? (
          <SecondaryButton
            onClick={() => {
              item.action?.onClick?.();
            }}
            disabled={item.action.disabled}
          >
            {item.action.label}
          </SecondaryButton>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#5F6368]">
        {item.whereLabel ? <span>{item.whereLabel}</span> : null}
        {item.whereLabel && item.sourceLabel ? <span>·</span> : null}
        {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
        {item.countdownTo ? (
          <>
            {(item.whereLabel || item.sourceLabel) ? <span>·</span> : null}
            <CountdownText
              target={item.countdownTo}
              prefix="Ends in"
              className="font-medium text-[#8A5A11]"
            />
          </>
        ) : null}
      </div>

      {item.note ? (
        <div className="text-[12.5px] leading-5 text-[#5F6368]">{item.note}</div>
      ) : null}

      {(item.bookingState || item.paymentState) ? (
        <div className="flex flex-wrap items-center gap-2">
          {item.bookingState ? <BookingStateChip state={item.bookingState} /> : null}
          {item.paymentState ? <PaymentStateChip state={item.paymentState} /> : null}
        </div>
      ) : null}
    </article>
  );
}
