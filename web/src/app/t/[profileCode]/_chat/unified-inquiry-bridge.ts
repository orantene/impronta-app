/**
 * unified-inquiry-bridge — pure adapters between the live GuestDetailChips
 * vocabulary (GuestChipValue, keyed by GuestChipKind) and the useUnifiedInquiry
 * patch/intent vocabulary (P1-T2 / P1-T3).
 *
 *   • chipValueToPatch  — a chip-editor submit (GuestChipKind + GuestChipValue)
 *     → the UnifiedInquiryPatch the hook's patch() accepts, so chip edits route
 *     through the single-record hook instead of calling captureGuestChip directly.
 *   • chipValuesToServerIntent — the server-read chip values (getGuestInquiryDetails)
 *     → an InquiryIntent the hook reconciles as `serverIntent`, so a remote edit
 *     (admin/talent) flows back into the live chips after a realtime refresh.
 *
 * No backend import, no React — just shape translation. Keeps MiniChatPanel lean
 * and the conversions unit-testable.
 */

import type {
  GuestChipKind,
  GuestChipValue,
  GuestInquiryDetailValues,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { UnifiedInquiryPatch } from "./use-unified-inquiry";

/**
 * Translate one chip-editor submit into the hook's UnifiedInquiryPatch. Returns
 * null for kinds the chip row does not emit through this path (none today —
 * every GuestChipKind maps), so callers can no-op safely.
 */
export function chipValueToPatch(
  kind: GuestChipKind,
  value: GuestChipValue,
): UnifiedInquiryPatch | null {
  switch (kind) {
    case "date":
      return {
        kind: "date",
        status: value.dateStatus,
        eventDate: value.eventDate ?? null,
      };
    case "location":
      return {
        kind: "location",
        status: value.locationStatus,
        city: value.city ?? null,
      };
    case "headcount":
      return { kind: "headcount", count: value.headcount ?? null };
    case "event_type":
      return { kind: "event_type", eventTypeLabel: value.eventType ?? "" };
    case "budget":
      return {
        kind: "budget",
        preference: value.budgetPreference ?? "not_sure",
        amount: value.budgetAmount ?? null,
        currency: value.currency ?? undefined,
      };
    case "talent":
      return {
        kind: "talent",
        selectedIds: value.selectedIds ?? [],
        selectionMode: value.selectionMode ?? undefined,
        selectedNames: value.selectedNames ?? undefined,
      };
    case "brief":
      return { kind: "brief", summary: value.summary ?? "" };
    case "contact":
      return {
        kind: "contact",
        name: value.contactName ?? null,
        email: value.contactEmail ?? null,
        phone: value.contactPhone ?? null,
      };
    default:
      return null;
  }
}

/**
 * Fold the server-read chip values into an InquiryIntent base for the hook's
 * inbound reconcile (serverIntent). Only fields present in `values` are set; the
 * hook keeps any still-in-flight local field on top of this base.
 */
export function chipValuesToServerIntent(
  values: GuestInquiryDetailValues,
): InquiryIntent {
  const intent: InquiryIntent = {
    source: "public_talent_profile",
    requester: {},
  };

  const date = values.date;
  if (date) {
    intent.date = {
      ...(date.dateStatus
        ? { status: date.dateStatus as NonNullable<InquiryIntent["date"]>["status"] }
        : {}),
      ...(date.eventDate ? { event_date: date.eventDate } : {}),
    };
  }

  const loc = values.location;
  if (loc) {
    intent.location = {
      ...(loc.locationStatus
        ? {
            status: loc.locationStatus as NonNullable<
              InquiryIntent["location"]
            >["status"],
          }
        : {}),
      ...(loc.city ? { city: loc.city } : {}),
    };
  }

  const headcount = values.headcount;
  const talent = values.talent;
  if (headcount || talent) {
    intent.talent = {
      ...(headcount?.headcount != null ? { count_needed: headcount.headcount } : {}),
      ...(talent
        ? {
            selected_ids: talent.selectedIds ?? [],
            ...(talent.selectionMode
              ? { selection_mode: talent.selectionMode }
              : {}),
          }
        : {}),
    };
  }

  const eventType = values.event_type?.eventType;
  if (eventType) {
    intent.source_context = { ai_event_type: eventType };
  }

  const budget = values.budget;
  if (budget) {
    intent.budget = {
      preference: (budget.budgetPreference ??
        "not_sure") as NonNullable<InquiryIntent["budget"]>["preference"],
      ...(budget.budgetAmount != null ? { amount: budget.budgetAmount } : {}),
      ...(budget.currency ? { currency: budget.currency } : {}),
    };
  }

  const brief = values.brief?.summary;
  if (brief) {
    intent.brief = { summary: brief };
  }

  const contact = values.contact;
  if (contact) {
    intent.requester = {
      ...intent.requester,
      ...(contact.contactName ? { name: contact.contactName } : {}),
      ...(contact.contactEmail ? { email: contact.contactEmail } : {}),
      ...(contact.contactPhone ? { phone: contact.contactPhone } : {}),
    };
  }

  return intent;
}
