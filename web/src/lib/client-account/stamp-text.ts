import type { ZonedWhen } from "./area-pure";

/** "date, time zone" for a message stamp; empty when there is no time. Pure. */
export function stampText(w: ZonedWhen | null): string {
  return w ? [w.date, [w.time, w.tzLabel].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
}
