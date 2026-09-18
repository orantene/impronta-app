/**
 * Front Door Chat v2 / F03 — hold rows on the guest Items shelf.
 *
 * The shelf already labelled `fulfilment_state === "hold"` as Held (D-MSG-206)
 * with no countdown. This module attaches the slot/table label and expiry
 * already on the thread (`professional_times` / `service_card`+`variant=table`)
 * onto the conversation_records chips. PURE: no I/O.
 *
 * Tables still do not place a capacity hold (D-MSG-157). A table payload
 * without `holdExpiresAt` still shows the picked label; we never invent a hold.
 */

import type { GuestConversationItems, GuestRecordChip } from "@/lib/inquiry/guest-chat-contract";
import { formatHoldCountdown, holdCountdown, cardPropsFromMessage } from "@/lib/messages-v5/record-cards";
import { readTimes } from "@/lib/messages-v5/client-thread-view";

export type HoldMessage = {
  readonly kind: string;
  readonly payload: Record<string, unknown> | null;
};

export type HoldOverlay = {
  readonly kind: "appointment" | "reservation";
  readonly recordId: string;
  readonly label: string | null;
  readonly holdExpiresAt: string | null;
  readonly recordDate: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function readHoldFromTimes(payload: Record<string, unknown> | null): HoldOverlay | null {
  const times = readTimes(payload);
  if (!times.pickedStartsAt) return null;
  const holdId = str(payload?.holdId);
  return {
    kind: "appointment",
    recordId: holdId ?? `times:${times.pickedStartsAt}`,
    label: times.pickedStartsAt,
    holdExpiresAt: times.holdExpiresAt,
    recordDate: times.pickedStartsAt,
  };
}

export function readHoldFromTable(payload: Record<string, unknown> | null): HoldOverlay | null {
  if (str(payload?.variant) !== "table") return null;
  const props = cardPropsFromMessage("service_card", payload);
  if (!props || !("tableLabel" in props)) return null;
  const table = props as { tableLabel: string | null; startsAt: string | null; holdExpiresAt: string | null };
  if (!table.tableLabel && !table.startsAt) return null;
  return {
    kind: "reservation",
    recordId: `table:${table.tableLabel ?? table.startsAt ?? "picked"}`,
    label: table.tableLabel,
    holdExpiresAt: table.holdExpiresAt,
    recordDate: table.startsAt,
  };
}

export function overlaysFromMessages(messages: readonly HoldMessage[]): HoldOverlay[] {
  const out: HoldOverlay[] = [];
  for (const m of messages) {
    if (m.kind === "professional_times") {
      const h = readHoldFromTimes(m.payload);
      if (h) out.push(h);
    } else if (m.kind === "service_card") {
      const h = readHoldFromTable(m.payload);
      if (h) out.push(h);
    }
  }
  return out;
}

function matchesChip(chip: GuestRecordChip, overlay: HoldOverlay): boolean {
  if (chip.recordId && chip.recordId === overlay.recordId) return true;
  if (overlay.kind === "appointment") {
    return chip.kind === "appointment" || chip.fulfilmentState === "hold";
  }
  return chip.kind === "reservation";
}

export function decorateHoldChips(
  items: GuestConversationItems | null,
  messages: readonly HoldMessage[],
): GuestConversationItems | null {
  const overlays = overlaysFromMessages(messages);
  if (!items && overlays.length === 0) return null;
  const records: GuestRecordChip[] = [...(items?.records ?? [])];
  const used = new Set<number>();
  for (const overlay of overlays) {
    const idx = records.findIndex((r, i) => !used.has(i) && matchesChip(r, overlay));
    if (idx >= 0) {
      used.add(idx);
      const prev = records[idx];
      records[idx] = {
        ...prev,
        label: overlay.label ?? prev.label ?? null,
        holdExpiresAt: overlay.holdExpiresAt ?? prev.holdExpiresAt ?? null,
        recordDate: overlay.recordDate ?? prev.recordDate,
      };
      continue;
    }
    records.push({
      kind: overlay.kind,
      recordId: overlay.recordId,
      paymentState: null,
      fulfilmentState: overlay.holdExpiresAt ? "hold" : null,
      recordDate: overlay.recordDate,
      label: overlay.label,
      holdExpiresAt: overlay.holdExpiresAt,
    });
  }
  if (!items) return { currency: "USD", lines: [], records };
  return { ...items, records };
}

/** Shelf countdown: live minutes, ended, or null when the row has no expiry. */
export function shelfHoldLabel(
  holdExpiresAt: string | null | undefined,
  now: Date,
  labels: { readonly minutesLeft: string; readonly ended: string },
): string | null {
  return formatHoldCountdown(holdCountdown(holdExpiresAt, now), labels);
}
