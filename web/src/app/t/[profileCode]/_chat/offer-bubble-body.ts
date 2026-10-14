/**
 * TUL-280: the legacy offer bubble used to print `m.body`, which the engine
 * writes in the STAFF's voice and in English ("Offer sent to client."). A
 * Spanish guest read that line inside a translated widget. For a freshly sent
 * offer the bubble now speaks to the guest from the catalog; every other
 * state keeps the caller's own rendering.
 */

type Translate = (key: string) => string;

export function offerBubbleBody(
  m: { kind: string; body: string; cardPayload: unknown },
  t: Translate,
): string | null {
  if (m.kind !== "offer_event") return null;
  const p = m.cardPayload && typeof m.cardPayload === "object" ? (m.cardPayload as Record<string, unknown>) : null;
  if (p?.status !== "sent") return null;
  return t("public.guestChat.offerSentBody");
}
