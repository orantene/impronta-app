"use client";

import { PrimaryButton, SecondaryButton } from "../../../primitives";
import type { AgendaNowAction } from "../types";

const TONE_CLASSNAME = {
  neutral: "border-[rgba(11,11,13,0.10)] bg-white",
  info: "border-[rgba(59,76,202,0.18)] bg-[rgba(59,76,202,0.06)]",
  success: "border-[rgba(31,92,66,0.18)] bg-[rgba(31,92,66,0.08)]",
  attention: "border-[rgba(138,90,17,0.18)] bg-[rgba(138,90,17,0.08)]",
  danger: "border-[rgba(122,31,38,0.18)] bg-[rgba(176,48,58,0.08)]",
} as const;

export function NowBox({
  title,
  body,
  tone = "neutral",
  primaryAction,
  secondaryAction,
}: {
  title: string;
  body: string;
  tone?: keyof typeof TONE_CLASSNAME;
  primaryAction?: AgendaNowAction;
  secondaryAction?: AgendaNowAction;
}) {
  return (
    <section
      className={`rounded-[18px] border px-4 py-4 ${TONE_CLASSNAME[tone]}`}
    >
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
        Now
      </div>
      <h3 className="mt-1 text-[16px] font-semibold text-[var(--tc-primary)]">
        {title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-6 text-[#5F6368]">{body}</p>
      {(primaryAction || secondaryAction) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryAction ? (
            <PrimaryButton onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
              {primaryAction.label}
            </PrimaryButton>
          ) : null}
          {secondaryAction ? (
            <SecondaryButton onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
              {secondaryAction.label}
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
