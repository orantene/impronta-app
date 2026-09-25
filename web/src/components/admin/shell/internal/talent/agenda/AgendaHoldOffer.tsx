"use client";

import { TALENT_AGENDA_VARS } from "./primitives";

/** T8.3 Hold offer other times. */
export function AgendaHoldOffer({
  times,
  onClose,
  onSend,
}: {
  times: string[];
  onClose: () => void;
  onSend?: (picked: string[]) => void;
}) {
  const picks = times.slice(0, 3);
  return (
    <div style={TALENT_AGENDA_VARS} className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
      <h2 className="text-[15px] font-semibold">Offer other times</h2>
      <p className="text-[13px] text-[#5F6368]">
        Nothing is held until the client picks. Up to three free starts.
      </p>
      <ul className="space-y-2 text-[14px]">
        {picks.map((t) => (
          <li key={t} className="rounded-xl bg-[#f5f5f0] px-3 py-2">{t}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-[44px] rounded-full bg-[var(--tc-primary)] px-4 text-[13px] text-white"
          onClick={() => onSend?.(picks)}
        >
          Send times
        </button>
        <button type="button" className="min-h-[44px] rounded-full border border-black/10 px-4 text-[13px]" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
