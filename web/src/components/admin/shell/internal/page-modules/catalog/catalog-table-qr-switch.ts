/**
 * TUL-1916 — what the "Table QR" switch writes and when it reads as on.
 *
 * The flag is `talent_offerings.table_qr_enabled`, separate from `status`, so
 * the item stays on the website and at the counter. Same published-state rule
 * as POS · Counter: the flag may be set on a draft (it is stored), but the row
 * reads as on only once the item is published. Before the column is applied
 * (no loaded row carries the key) the switch writes nothing and stays disabled.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function tableQrColumnPresent(items: ReadonlyArray<Pick<TalentOffering, "tableQrEnabled">>): boolean {
  return items.some((i) => typeof i.tableQrEnabled === "boolean");
}

export function tableQrSwitchPatch(
  item: Pick<TalentOffering, "tableQrEnabled">,
  next: boolean,
  ctx: { columnPresent: boolean },
): Partial<TalentOffering> {
  if (ctx.columnPresent || typeof item.tableQrEnabled === "boolean") return { tableQrEnabled: next };
  return {};
}

/** On the table-QR menu: published and not switched off (a missing flag means on, as the reader treats it). */
export function isTableQrOn(item: Pick<TalentOffering, "status" | "tableQrEnabled">): boolean {
  return item.status === "published" && item.tableQrEnabled !== false;
}
