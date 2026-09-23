/**
 * Whether a conversation's items are the talent's own offerings, and the
 * catalog row those offerings become. No I/O.
 */

import type { CatalogOption, CatalogRow } from "@/lib/messages-v5/items-picker";

export function isTalentOwnedConversation(input: {
  hostKind: string | null;
  tenantId: string;
  hubTenantId: string | null;
}): boolean {
  if (input.hostKind === "talent_site") return true;
  return !!input.hubTenantId && input.tenantId === input.hubTenantId;
}

export function readInquiryTalentContext(sourceContext: unknown): { hostKind: string | null; talentIds: string[] } {
  let obj: Record<string, unknown> | null = null;
  if (typeof sourceContext === "string") {
    try {
      const parsed = JSON.parse(sourceContext) as unknown;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = null;
    }
  } else if (sourceContext && typeof sourceContext === "object") {
    obj = sourceContext as Record<string, unknown>;
  }
  const hostKind = obj && typeof obj.host_kind === "string" ? obj.host_kind : null;
  const talentIds =
    obj && Array.isArray(obj.talent_ids)
      ? obj.talent_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  return { hostKind, talentIds };
}

export type TalentCatalogOffering = {
  id: string;
  title: string | null;
  amountCents: number | null;
  currency: string | null;
  kind: string;
  durationMinutes: number | null;
  soldOut: boolean;
  variants: readonly CatalogOption[];
  addOns: readonly CatalogOption[];
};

export function talentOfferingCatalogRow(row: TalentCatalogOffering): CatalogRow {
  const category = row.kind === "package" ? "package" : row.kind === "service" ? "service" : "menu";
  return {
    id: `${category}:${row.id}`,
    category,
    title: row.title?.trim() || "Item",
    sub: row.durationMinutes && row.durationMinutes > 0 ? `${row.durationMinutes} min` : null,
    amountCents: typeof row.amountCents === "number" ? row.amountCents : null,
    currency: row.currency?.trim().toUpperCase() || null,
    availability: row.soldOut ? { kind: "busy", reason: "sold_out" } : { kind: "free" },
    offeringId: row.id,
    durationMinutes: row.durationMinutes,
    variants: row.variants,
    addOns: row.addOns,
  };
}
