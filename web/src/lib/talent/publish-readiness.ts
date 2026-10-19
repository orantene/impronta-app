/**
 * TUL-1270 #11: one "ready to publish?" rule for the Services editor AND the
 * server. PURE (no DB, no server-only) so the editor panel, the publish gate in
 * upsertTalentOffering and the tests share it.
 *
 * Required (publish is blocked until each is there):
 *  - name: a title.
 *  - price: an amount, unless the item is priced by quote ("Contact for price").
 *  - length: a duration for a timed SERVICE sold at a price. Packages may be
 *    untimed (they go through the purchase flow) and products have no length,
 *    the same rule Add many and Camera add already apply.
 *  - currency: a 3-letter currency.
 *  - deposit: a deposit percent (1 to 99) when instant booking takes a deposit.
 *
 * Advice (shown, never blocking): a photo. TUL-825 made photos optional, so a
 * missing photo is a tip, not a gate.
 */
import { PLATFORM_DEFAULT_BOOKING_POSTURE } from "@/lib/talent/selling-booking-settings";

export type PublishGap = "name" | "price" | "length" | "currency" | "deposit";
export type PublishAdvice = "photo";

export type PublishReadinessInput = {
  title: string;
  kind: "service" | "package" | "product";
  priceDisplay?: string | null;
  priceType?: string | null;
  amountCents: number | null;
  durationMinutes: number | null;
  currency: string | null;
  bookingMode: string | null;
  reserveMode?: string | null;
  depositPct?: number | null;
  imageUrls?: readonly string[] | null;
};

export type PublishReadiness = {
  ready: boolean;
  missing: PublishGap[];
  advice: PublishAdvice[];
};

/** Same definition validateOffering uses: an explicit quote, or a custom (quoted) price type. */
export function isQuotePriced(o: Pick<PublishReadinessInput, "priceDisplay" | "priceType">): boolean {
  return o.priceDisplay === "quote" || o.priceType === "custom";
}

export function publishReadiness(
  o: PublishReadinessInput,
  defaultPosture?: string | null,
): PublishReadiness {
  const missing: PublishGap[] = [];
  const quote = isQuotePriced(o);
  const effectiveMode = o.bookingMode ?? defaultPosture ?? PLATFORM_DEFAULT_BOOKING_POSTURE;
  if (!o.title || !o.title.trim()) missing.push("name");
  if (!quote && (o.amountCents == null || o.amountCents < 0)) missing.push("price");
  if (o.kind === "service" && !quote && (o.durationMinutes == null || o.durationMinutes <= 0)) {
    missing.push("length");
  }
  if (!o.currency || o.currency.trim().length < 3) missing.push("currency");
  if (
    !quote &&
    effectiveMode === "instant" &&
    o.reserveMode === "deposit" &&
    (o.depositPct == null || o.depositPct <= 0 || o.depositPct >= 100)
  ) {
    missing.push("deposit");
  }
  const advice: PublishAdvice[] = (o.imageUrls?.length ?? 0) === 0 ? ["photo"] : [];
  return { ready: missing.length === 0, missing, advice };
}

/**
 * True when this save moves the item onto the public menu: a new item saved as
 * published, or a stored draft / hidden / archived row being published. Saving
 * an item that is already live is not a transition (quick edits on the list
 * must keep working); the editor shows the same list for live items.
 */
export function isPublishTransition(
  nextStatus: string | null | undefined,
  priorStatus: string | null | undefined,
): boolean {
  return nextStatus === "published" && priorStatus !== "published";
}

const GAP_EN: Record<PublishGap, string> = {
  name: "a name",
  price: "a price",
  length: "a length",
  currency: "a currency",
  deposit: "a deposit percent",
};

const GAP_ES: Record<PublishGap, string> = {
  name: "un nombre",
  price: "un precio",
  length: "una duración",
  currency: "una moneda",
  deposit: "un porcentaje de anticipo",
};

/** Short label for one gap, in the dashboard language. */
export function publishGapLabel(gap: PublishGap, isSpanish: boolean): string {
  return (isSpanish ? GAP_ES : GAP_EN)[gap];
}

function joinList(parts: string[], and: string): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`;
}

/** The server refusal (English; the editor localizes it with publishRefusalToSpanish). */
export function notReadyToPublishMessage(title: string, missing: readonly PublishGap[]): string {
  const name = title.trim() || "This service";
  return `“${name}” is not ready to publish. It still needs ${joinList(missing.map((g) => GAP_EN[g]), "and")}.`;
}

const REFUSAL_RE = /^“(.+)” is not ready to publish\. It still needs (.+)\.$/;

/** Spanish for the server refusal, or null when the text is not that refusal. */
export function publishRefusalToSpanish(message: string): string | null {
  const m = REFUSAL_RE.exec(message.trim());
  if (!m) return null;
  const byEn = new Map(Object.entries(GAP_EN).map(([k, v]) => [v, k as PublishGap]));
  const parts = m[2]!.split(/, | and /).map((p) => byEn.get(p.trim()));
  if (parts.some((p) => p === undefined)) return null;
  const es = parts.map((g) => GAP_ES[g as PublishGap]);
  return `“${m[1]}” todavía no está lista para publicar. Le falta ${joinList(es, "y")}.`;
}
