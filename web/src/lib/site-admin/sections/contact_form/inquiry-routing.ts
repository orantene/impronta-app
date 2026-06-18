/**
 * FORMS-2 — form-to-inquiry routing mapper (PURE, no DB).
 *
 * When a contact_form section is set to `routingMode === "inquiry"`, the
 * public submit route funnels the submission into the SHARED inquiry engine
 * (createInquiryFromIntent) instead of inserting a generic
 * cms_form_submissions row. This module owns the PURE mapping from a
 * validated form payload → InquiryIntent + the routing decision. Keeping it
 * pure (no Supabase, no I/O) makes the mapping unit-testable and keeps the
 * route thin.
 *
 * SECURITY: the tenant is resolved by the CALLER strictly from the trusted
 * section.tenant_id (never from payload). This mapper only shapes the intent;
 * it does not pick a tenant. The single client-influenced routing input is the
 * configured `inquiryTargetTalentId` (from the saved section props, not the
 * live submission), which the route roster-validates against the resolved
 * tenant before the engine call.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §11 (InquiryIntent) — the
 * one canonical client-side inquiry shape every entry point funnels through.
 */

import type { ContactFormV1 } from "./schema";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

/**
 * Outcome of inspecting a submission for inquiry routing.
 *
 *   - "internal": route this submission to the inbox (cms_form_submissions).
 *     Either the form is not inquiry-mode, or it is but the payload can't form
 *     a valid intent (fail-safe — never a half-created inquiry).
 *   - "inquiry": build the intent and call createInquiryFromIntent.
 */
export type FormRoutingDecision =
  | { mode: "internal" }
  | {
      mode: "inquiry";
      intent: InquiryIntent;
      /** Roster-validate this id before the engine call (may be null). */
      targetTalentId: string | null;
      /** Projected contact email — used to provision the guest client. */
      contactEmail: string;
      /** Projected contact name. */
      contactName: string;
      /** Projected contact phone (or null). */
      contactPhone: string | null;
    };

/** Reads a payload value as a trimmed string, or "" when absent/non-string. */
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Project the canonical contact triplet (name / email / phone) + the brief
 * message + any extra fields out of a submitted payload, using the section's
 * field definitions to locate them.
 *
 * Field discovery is by TYPE first (email-type field → email; tel-type →
 * phone), then by canonical name fallback ("name", "email", "phone",
 * "message"). The longest non-contact text/textarea value becomes the brief
 * summary when no field is explicitly named "message". Every remaining field
 * is folded into the brief so the coordinator sees the full submission.
 */
export function projectFormContact(
  props: ContactFormV1,
  payload: Record<string, unknown>,
): {
  name: string;
  email: string;
  phone: string | null;
  message: string;
  extraLines: string[];
} {
  const fields = props.fields ?? [];

  // Locate the contact fields by type, then by canonical name.
  const emailField =
    fields.find((f) => f.type === "email") ??
    fields.find((f) => f.name === "email");
  const phoneField =
    fields.find((f) => f.type === "tel") ??
    fields.find((f) => f.name === "phone");
  const nameField =
    fields.find((f) => f.name === "name") ??
    fields.find((f) => f.type === "text");
  const messageField =
    fields.find((f) => f.name === "message") ??
    fields.find((f) => f.type === "textarea");

  const email = emailField ? str(payload[emailField.name]) : str(payload.email);
  const phoneRaw = phoneField
    ? str(payload[phoneField.name])
    : str(payload.phone);
  const name = nameField ? str(payload[nameField.name]) : str(payload.name);
  const message = messageField
    ? str(payload[messageField.name])
    : str(payload.message);

  // Fold every OTHER submitted field into "label: value" lines so the
  // coordinator sees the rich-field answers (date / number / select / etc.)
  // that FORMS-1 added. Skip the contact + message fields already projected
  // and any internal/reserved keys.
  const consumed = new Set(
    [emailField, phoneField, nameField, messageField]
      .map((f) => f?.name)
      .filter((n): n is string => !!n),
  );
  const extraLines: string[] = [];
  for (const field of fields) {
    if (consumed.has(field.name)) continue;
    // consent is a legal acknowledgement, not booking signal — keep it out of
    // the visible brief (it was already enforced server-side).
    if (field.type === "consent") continue;
    const raw = payload[field.name];
    const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
    if (!value) continue;
    extraLines.push(`${field.label}: ${value}`);
  }

  return { name, email, phone: phoneRaw || null, message, extraLines };
}

/**
 * Decide how to route a submission and, for inquiry mode, build the
 * InquiryIntent.
 *
 * Fail-safe contract (plan FORMS-2 risk): inquiry mode REQUIRES a contact name
 * AND (email OR phone) AND (a brief message OR a target talent) — exactly the
 * hard requirements validateIntentForSubmit enforces. If any are missing we
 * return `{ mode: "internal" }` so the route falls back to the inbox insert
 * rather than attempting a half-created inquiry. The caller still runs the
 * full engine validation; this is the cheap pre-check that keeps the inbox
 * fallback honest.
 *
 * `referrerUrl` (the request Referer header, server-trusted) is recorded in
 * source_context for provenance only — it never influences tenant resolution.
 */
export function decideFormRouting(
  props: ContactFormV1,
  payload: Record<string, unknown>,
  opts: { referrerUrl?: string | null } = {},
): FormRoutingDecision {
  if (props.routingMode !== "inquiry") {
    return { mode: "internal" };
  }

  const { name, email, phone, message, extraLines } = projectFormContact(
    props,
    payload,
  );

  const targetTalentId = props.inquiryTargetTalentId?.trim() || null;
  const hasContact = !!name && (!!email || !!phone);
  const hasBriefOrTalent = !!message || !!targetTalentId;

  // Fail safe → inbox. A submission that can't satisfy the engine's hard
  // requirements must never attempt inquiry creation (no orphan inquiries).
  if (!hasContact || !hasBriefOrTalent) {
    return { mode: "internal" };
  }

  // Compose the brief summary: the message plus any rich-field answers.
  const summaryParts = [message, ...extraLines].filter(Boolean);
  const summary = summaryParts.join("\n").slice(0, 4000);

  const intent: InquiryIntent = {
    // A form bound to a specific talent reads as a public-profile-style
    // inquiry; a talent-less form is an agency-site inquiry. Both funnel
    // through the SAME engine entry point.
    source: targetTalentId ? "public_talent_profile" : "agency_site",
    source_context: {
      contact_form: true,
      ...(opts.referrerUrl ? { referrer_url: opts.referrerUrl } : {}),
    },
    requester: {
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      trust_level: "basic",
    },
    talent: targetTalentId
      ? { selected_ids: [targetTalentId], selection_mode: "i_know_who" }
      : { selection_mode: "agency_recommends" },
    // validateIntentForSubmit hard-requires (city|status) and (event_date|
    // status). A contact form carries no structured location/date, so seed
    // "not_sure" to satisfy the validator (the coordinator collects specifics
    // in-thread, exactly like the guest-chat path does).
    location: { status: "not_sure" },
    date: { status: "not_sure" },
    ...(summary ? { brief: { summary } } : {}),
  };

  return {
    mode: "inquiry",
    intent,
    targetTalentId,
    contactEmail: email,
    contactName: name,
    contactPhone: phone,
  };
}
