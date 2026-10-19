/**
 * TUL-1271 #3 — what the "POS · Counter" switch writes. With the `pos_enabled`
 * column (the row carries `posEnabled`) it writes that flag alone, so the item
 * stays on the website, /book and the QR menu. Before the held migration is
 * applied the row has no flag, so the switch keeps its old behaviour (status).
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function posSwitchPatch(item: Pick<TalentOffering, "posEnabled">, next: boolean): Partial<TalentOffering> {
  if (typeof item.posEnabled === "boolean") return { posEnabled: next };
  return { status: next ? "published" : "draft" };
}
