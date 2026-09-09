/**
 * Marketing vs transactional consent — purpose-scoped ledger shape.
 */

export type ConsentPurpose = "marketing" | "transactional" | "product_updates";

export type ConsentRecord = {
  customerId: string;
  tenantId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  recordedAt: string;
};

export function maySendCampaign(
  consents: readonly ConsentRecord[],
  input: { customerId: string; purpose: ConsentPurpose },
): boolean {
  if (input.purpose === "transactional") return true;
  const row = consents
    .filter((c) => c.customerId === input.customerId && c.purpose === input.purpose)
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  return row?.granted === true;
}
