"use client";

import {
  partyWaitlistJoin,
  partyWaitlistLeave,
  partyWaitlistNotify,
  partyWaitlistSeat,
} from "@/lib/server-actions/venue-engine";
import type { FloorOutcome } from "@/components/admin/floor/floor-types";

function asOutcome(res: { ok: true } | { ok: false; reason: string }): FloorOutcome {
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

export async function floorJoinWaitlist(input: {
  holderName: string;
  partySize: number;
  holderPhone?: string;
}): Promise<FloorOutcome> {
  return asOutcome(
    await partyWaitlistJoin({
      holderName: input.holderName.trim() || "Walk-in",
      partySize: input.partySize,
      holderPhone: input.holderPhone?.trim() ? input.holderPhone.trim() : null,
    }),
  );
}

export async function floorNotifyWaitlist(input: {
  id: string;
  expectedVersion?: number;
  holderPhone?: string | null;
  holderEmail?: string | null;
}): Promise<FloorOutcome> {
  return asOutcome(await partyWaitlistNotify(input));
}

export async function floorSeatWaitlist(input: {
  id: string;
  spaceId: string;
  expectedVersion?: number;
}): Promise<FloorOutcome> {
  return asOutcome(
    await partyWaitlistSeat({
      id: input.id,
      spaceId: input.spaceId,
      operationKey: `waitlist-${input.id}-${Date.now()}`,
      expectedVersion: input.expectedVersion,
    }),
  );
}

export async function floorLeaveWaitlist(input: { id: string; expectedVersion?: number }): Promise<FloorOutcome> {
  return asOutcome(await partyWaitlistLeave(input));
}
