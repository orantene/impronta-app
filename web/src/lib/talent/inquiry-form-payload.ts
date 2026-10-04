/**
 * Inquiry form sheet (chat off) → canonical funnel input. Pure.
 *
 * The form never writes an inquiry itself: the payload is a
 * `StartGuestChatInput`, the same input the guest dock sends, and the server
 * action hands it to `startGuestChatInquiry` → `createInquiryFromIntent`
 * (binding rule: ALL inquiry creation goes through the funnel). The first
 * selected service rides on `offering` (→ source_context.offering); when the
 * visitor picked more than one, all of them ride on `lines`
 * (→ source_context.lines).
 */
import type { StartGuestChatInput } from "@/lib/inquiry/guest-chat-contract";
import type { OfferingTaskBrief } from "@/lib/talent/offering-task-brief";

export type InquiryFormLine = {
  offeringId: string;
  title: string;
  amountCents?: number | null;
  currency?: string | null;
  priceType?: string | null;
  kind?: string | null;
  variantLabel?: string | null;
  addOnLabels?: string[];
  slotLabel?: string | null;
  totalCents?: number | null;
  /** Display only: the selection dock's "Asking about" names (#2385). */
  label?: string | null;
  /** Gridline G9b: the task-picker task (→ source_context.offering.brief). */
  brief?: OfferingTaskBrief | null;
};

export type InquiryFormFields = {
  name: string;
  email: string;
  message: string;
  /** Hidden honeypot input; any value is a silent reject downstream. */
  honeypot?: string;
};

export type InquiryFormContext = {
  tenantSlug: string;
  talentProfileId: string;
  talentProfileCode: string;
  sourcePage: string;
  locale: string;
  lines: InquiryFormLine[];
};

export type InquiryFormFieldError = "name" | "email" | "message";

export type InquiryFormBuild =
  | { ok: true; input: StartGuestChatInput }
  | { ok: false; errors: InquiryFormFieldError[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MAX = 4000;

/** Placeholder chip ids (e.g. the dock's "default-custom-quote") are not offerings. */
function isRealOfferingId(id: string): boolean {
  return id.trim().length > 0 && !id.startsWith("default-");
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export function buildInquiryFormPayload(
  fields: InquiryFormFields,
  ctx: InquiryFormContext,
): InquiryFormBuild {
  const name = fields.name.trim();
  const email = fields.email.trim();
  const message = fields.message.trim().slice(0, MESSAGE_MAX);
  const errors: InquiryFormFieldError[] = [];
  if (!name) errors.push("name");
  if (!EMAIL_RE.test(email)) errors.push("email");
  if (!message) errors.push("message");
  if (errors.length > 0) return { ok: false, errors };

  const seen = new Set<string>();
  const lines = ctx.lines.filter((l) => {
    if (!isRealOfferingId(l.offeringId) || seen.has(l.offeringId)) return false;
    seen.add(l.offeringId);
    return true;
  });
  const first = lines[0] ?? null;
  const { first: firstName, last: lastName } = splitName(name);

  const input: StartGuestChatInput = {
    tenantSlug: ctx.tenantSlug,
    talentProfileId: ctx.talentProfileId,
    talentProfileCode: ctx.talentProfileCode,
    contactFirstName: firstName,
    contactLastName: lastName || null,
    contactName: name,
    contactEmail: email,
    firstMessage: message,
    sourcePage: ctx.sourcePage,
    honeypot: fields.honeypot ?? null,
    locale: ctx.locale,
    entryPoint: "inquiry_form",
    offering: first
      ? {
          offering_id: first.offeringId,
          title: first.title,
          amount_cents: first.amountCents ?? null,
          currency: first.currency || "USD",
          price_type: first.priceType || "custom",
          kind: first.kind || "service",
          ...(first.variantLabel ? { variant_label: first.variantLabel } : {}),
          ...(first.addOnLabels && first.addOnLabels.length > 0
            ? { add_on_labels: first.addOnLabels }
            : {}),
          ...(first.slotLabel ? { slot_label: first.slotLabel } : {}),
          ...(first.totalCents != null ? { total_cents: first.totalCents } : {}),
          ...(first.brief ? { brief: first.brief } : {}),
        }
      : null,
    ...(lines.length > 1
      ? {
          lines: lines.map((l) => ({
            offering_id: l.offeringId,
            title: l.title,
            amount_cents: l.amountCents ?? null,
            currency: l.currency || "USD",
          })),
        }
      : {}),
  };
  return { ok: true, input };
}
