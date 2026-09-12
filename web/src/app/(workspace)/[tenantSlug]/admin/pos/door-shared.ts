/**
 * door-shared.ts — what every Door screen reads from the one client: the
 * open door, the Recent card's line, the copy bundle, and the venue-clock
 * formatters. Kept apart from `door-client.tsx` so the screens do not import
 * the client that renders them.
 */

import type { CollectSheetCopy, IssuesCopy, PosChromeCopy, PosRefusalCopy, ReceiptsCopy } from "@/components/admin/pos";
import type { DoorCounts } from "@/lib/events/summary";
import { venueClock, type DoorVerdict } from "@/lib/pos/door-model";
import type { DoorNight, DoorRow, DoorTier } from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";

import type { DoorTonightSession } from "./door-actions";
import type { DoorCopy } from "./door-copy";

export type DoorScreenCopy = {
  door: DoorCopy;
  collect: CollectSheetCopy;
  refusal: PosRefusalCopy;
  chrome: PosChromeCopy;
  receipts: ReceiptsCopy;
  issues: IssuesCopy;
  modeLabel: string;
  frameNavLabel: string;
};

export type OpenDoor = {
  session: DoorTonightSession;
  rows: DoorRow[];
  counts: DoorCounts;
  tiers: DoorTier[];
  nights: DoorNight[];
};

/** One line of the box office's Recent card: what this till just saw at the gate. */
export type RecentScan = { readonly tone: DoorVerdict["tone"]; readonly text: string; readonly time: string };

/** "19:30" on the venue's clock, or the raw instant when the zone is unusable. */
export function timeAt(iso: string, zone: string, locale: string): string {
  return venueClock(iso, zone, locale)?.time ?? iso;
}

export function dateAt(iso: string, zone: string, locale: string): string {
  return venueClock(iso, zone, locale)?.date ?? iso;
}
