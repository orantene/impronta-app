/**
 * Shared offering→CTA event payload. Lives outside `app/t/[profileCode]` so
 * Max/vanity catalog islands never type- or value-import the hub route folder.
 */

import type { OfferingTaskRef } from "./offering-task-brief";
import type { IntakeAnswers, IntakeQuestion } from "./offering-intake";

/** Delivery / location values stored on `talent_offerings.attributes.where`. */
export type OfferingDeliveryWhere = "studio" | "client" | "remote" | "agreed";

const WHERE_KEYS = new Set<string>(["studio", "client", "remote", "agreed"]);

export type OfferingRequestDetail = {
  offeringId: string;
  talentProfileId: string | null;
  title: string;
  kind: string;
  priceType: string;
  /** exact | from | quote — quote must never paint as $0 in the sheet (AUD-006). */
  priceDisplay?: "exact" | "from" | "quote";
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
  /**
   * Per-service inquiry brief body — existing `talent_offerings.description`.
   * Surfaced in the shared booking/inquiry sheet when present.
   */
  description?: string | null;
  /**
   * Delivery / location from existing `attributes.where` jsonb.
   * No new columns — read-only projection of the offering attribute.
   */
  where?: OfferingDeliveryWhere[];
  /** Gridline G9b: the task picked in the task picker (W-11), when any. */
  task?: OfferingTaskRef | null;
  /** Editable brief note, pre-filled from `task`. Sent only on submit. */
  note?: string | null;
  /** Gridline G13: the service's intake questions (`attributes.intake`). Absent = none. */
  intake?: IntakeQuestion[];
  /** The visitor's answers so far (kept on detail so the CH-3 resume keeps them). */
  answers?: IntakeAnswers;
  /**
   * TUL-232: ISO-8601 UTC instant the visitor picked elsewhere (next-free-slot chip, deep link).
   * Absent means the sheet behaves exactly as before. Live mode only; never persisted.
   */
  slotStart?: string;
};

/** Read `attributes.where` without inventing schema. Unknown entries are dropped. */
export function offeringWhereFromAttributes(
  attributes: Record<string, unknown> | null | undefined,
): OfferingDeliveryWhere[] {
  const raw = attributes?.where;
  if (!Array.isArray(raw)) return [];
  const out: OfferingDeliveryWhere[] = [];
  for (const item of raw) {
    if (typeof item === "string" && WHERE_KEYS.has(item)) {
      out.push(item as OfferingDeliveryWhere);
    }
  }
  return out;
}

const WHERE_LABELS_EN: Record<OfferingDeliveryWhere, string> = {
  studio: "At studio",
  client: "At client",
  remote: "Remote",
  agreed: "By agreement",
};

const WHERE_LABELS_ES: Record<OfferingDeliveryWhere, string> = {
  studio: "En el estudio",
  client: "A domicilio",
  remote: "Remoto",
  agreed: "A convenir",
};

/** Localized delivery line for catalog rows and the inquiry brief sheet. */
export function formatOfferingWhereLabel(
  where: readonly OfferingDeliveryWhere[],
  locale?: string | null,
): string {
  if (!where.length) return "";
  const es = (locale ?? "es").toLowerCase().startsWith("es");
  const labels = es ? WHERE_LABELS_ES : WHERE_LABELS_EN;
  return where.map((w) => labels[w]).filter(Boolean).join(" · ");
}
