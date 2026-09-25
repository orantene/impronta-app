/**
 * Resolve prep (before) + turnaround (after) minutes from selling defaults
 * and optional per-offering attribute overrides.
 */

export type SellingTimeBuffers = {
  bufferBeforeMin: number | null;
  bufferAfterMin: number | null;
  minNoticeMin: number | null;
};

function finiteInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < min || n > max) return null;
  return n;
}

function attrNum(attributes: unknown, key: string): number | null {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  return finiteInt((attributes as Record<string, unknown>)[key], 0, 240);
}

export function resolveSellingTimeBuffers(input: {
  sellingDefaults?: unknown;
  offeringAttributes?: unknown;
}): SellingTimeBuffers {
  const raw =
    input.sellingDefaults && typeof input.sellingDefaults === "object" && !Array.isArray(input.sellingDefaults)
      ? (input.sellingDefaults as Record<string, unknown>)
      : null;
  const fromDefaultsAfter = raw ? finiteInt(raw.bufferAfterMin, 0, 240) : null;
  const fromDefaultsBefore = raw ? finiteInt(raw.bufferBeforeMin, 0, 240) : null;
  const fromOfferingAfter = attrNum(input.offeringAttributes, "bufferAfterMin");
  const fromOfferingBefore = attrNum(input.offeringAttributes, "bufferBeforeMin");
  return {
    bufferBeforeMin: fromOfferingBefore ?? fromDefaultsBefore,
    bufferAfterMin: fromOfferingAfter ?? fromDefaultsAfter,
    minNoticeMin: raw ? finiteInt(raw.minNoticeMin, 0, 60 * 24 * 30) : null,
  };
}

/** Seconds for reserve_resource_set hold padding (prep + cleanup). */
export function sellingBuffersAsHoldSeconds(buffers: SellingTimeBuffers): {
  bufferBeforeSeconds: number;
  bufferAfterSeconds: number;
} {
  return {
    bufferBeforeSeconds: (buffers.bufferBeforeMin ?? 0) * 60,
    bufferAfterSeconds: (buffers.bufferAfterMin ?? 0) * 60,
  };
}
