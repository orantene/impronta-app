/**
 * TUL-1271 #3 / TUL-1321 — what the "POS · Counter" switch writes.
 *
 * With the `pos_enabled` column (`columnPresent`: any loaded row carries the
 * flag) it writes that flag alone, so the item stays on the website, /book and
 * the QR menu, and never changes `status`. Before the held migration is applied
 * the old behaviour is kept for a SAVED item (status), but a draft that has not
 * been saved yet is never published by this switch: Publish does that.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function posSwitchPatch(
  item: Pick<TalentOffering, "posEnabled">,
  next: boolean,
  ctx: { columnPresent: boolean; isDraft: boolean },
): Partial<TalentOffering> {
  if (ctx.columnPresent || typeof item.posEnabled === "boolean") return { posEnabled: next };
  if (ctx.isDraft) return {};
  return { status: next ? "published" : "draft" };
}
