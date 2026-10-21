/**
 * The offer line shape the coordinator tools share. (Restated here so this PR
 * does not depend on #4173's offer-role-views.ts; the two are structurally
 * identical and are folded together once both are in.)
 */
export type OfferLine = {
  id: string;
  kind: "talent" | "house" | "custom";
  talentProfileId: string | null;
  label: string;
  units: number;
  unitPriceCents: number;
  talentCostCents: number;
  showWho: "name" | "portfolio" | "hidden";
  talentConfirmed: boolean | null;
};
