"use client";

export function EmptyDay({
  title = "Nothing booked today",
  body = "Your hours are clear right now.",
  nextFreeTime,
  actionLabel,
  onAction,
}: {
  title?: string;
  body?: string;
  nextFreeTime?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-[18px] border border-[rgba(11,11,13,0.10)] bg-white px-4 py-5 text-left">
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--tc-accent)]">
        Empty day
      </div>
      <h3 className="mt-1 text-[16px] font-semibold text-[var(--tc-primary)]">
        {title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-6 text-[#5F6368]">{body}</p>
      {nextFreeTime ? (
        <div className="mt-3 text-[13px] font-medium text-[var(--tc-primary)]">
          Next free time: {nextFreeTime}
        </div>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-[var(--tc-primary)] px-4 text-[13px] text-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
