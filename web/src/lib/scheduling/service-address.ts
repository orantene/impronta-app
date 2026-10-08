/**
 * TUL-436: the service address a client types when the booked service happens
 * at the client's place (home visit, client's event venue). Pure: no I/O, so
 * the sheet (validation), the action (re-validation) and the stamp share one
 * rule and one test.
 */
import { cleanEventLocation } from "@/lib/scheduling/booking-event-location";
import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

export const SERVICE_ADDRESS_MIN = 5;
export const SERVICE_ADDRESS_MAX = 200;
export const SERVICE_ADDRESS_NOTE_MAX = 120;

export type ServiceAddressRule = "required" | "hidden";

/**
 * `attributes.where` values: "studio" | "client" | "remote" | "agreed".
 * Only "client" (the client's place) asks for an address; a mixed list that
 * includes "client" is required. Studio-only, remote, agreed, empty or
 * unknown values stay hidden.
 */
export function serviceAddressRule(
  where: readonly OfferingDeliveryWhere[] | null | undefined,
): ServiceAddressRule {
  return Array.isArray(where) && where.includes("client") ? "required" : "hidden";
}

export type ServiceAddressInput = { address?: string | null; note?: string | null };

export type ServiceAddressErrorCode =
  | "address_required"
  | "address_too_short"
  | "address_too_long"
  | "note_too_long";

export type ServiceAddressResult =
  | { ok: true; value: { addressText: string | null; note: string | null } }
  | { ok: false; error: ServiceAddressErrorCode };

function squash(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export function validateServiceAddress(
  input: ServiceAddressInput,
  rule: ServiceAddressRule,
): ServiceAddressResult {
  if (rule === "hidden") return { ok: true, value: { addressText: null, note: null } };
  const address = squash(input.address);
  const note = squash(input.note);
  if (address.length === 0) return { ok: false, error: "address_required" };
  if (address.length < SERVICE_ADDRESS_MIN) return { ok: false, error: "address_too_short" };
  if (address.length > SERVICE_ADDRESS_MAX) return { ok: false, error: "address_too_long" };
  if (note.length > SERVICE_ADDRESS_NOTE_MAX) return { ok: false, error: "note_too_long" };
  return { ok: true, value: { addressText: address, note: note.length > 0 ? note : null } };
}

/**
 * The single string stored as `location_text` / sent as the booking's
 * location: "address (note)", or the address alone. Never longer than the
 * 200-char event-location cap: the note is shortened to fit, the address is
 * never cut. Null when there is no address.
 */
export function composeLocationText(input: ServiceAddressInput): string | null {
  const address = cleanEventLocation(input.address);
  if (!address) return null;
  const note = cleanEventLocation(input.note)?.slice(0, SERVICE_ADDRESS_NOTE_MAX).trim() || null;
  if (!note) return address;
  const room = SERVICE_ADDRESS_MAX - address.length - 3; // " (" + ")"
  if (room < 1) return address;
  const fitted = note.slice(0, room).trim();
  return fitted ? `${address} (${fitted})` : address;
}
