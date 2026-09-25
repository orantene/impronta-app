/**
 * Shared offering→CTA event payload. Lives outside `app/t/[profileCode]` so
 * Max/vanity catalog islands never type- or value-import the hub route folder.
 */

export type OfferingRequestDetail = {
  offeringId: string;
  talentProfileId: string | null;
  title: string;
  kind: string;
  priceType: string;
  amountCents: number | null;
  currency: string;
  durationMinutes: number | null;
  allowPayInPerson: boolean;
  requireAccountToBook?: boolean;
  reserveMode: "full" | "deposit" | "free";
  depositPct: number | null;
  cancellationHours?: number | null;
  imageUrl: string | null;
  /** D4 — selectable options (client picks one; null price = base applies). */
  variants?: { id: string; label: string; amountCents: number | null }[];
  /** D4 — stackable extras (client picks any). */
  addOns?: { id: string; label: string; amountCents: number; durationMinutes?: number | null }[];
  /** D5 — null = unlimited; products with stock cap the qty stepper. */
  inventoryQty?: number | null;
  /** Set when the offering sells from a capacity pool; null = unlimited. */
  capacityPoolId?: string | null;
  /** 'request' → inquiry/chat · 'instant' → direct booking */
  intent: "request" | "instant";
};
