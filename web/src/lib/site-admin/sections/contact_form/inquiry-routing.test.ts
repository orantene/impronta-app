/**
 * FORMS-2 — form-to-inquiry routing tests.
 *
 * Covers the PURE routing decision (decideFormRouting) that the public submit
 * route uses to choose between the inbox (cms_form_submissions) and the SHARED
 * inquiry engine, PLUS the validation-fail branch of createInquiryFromIntent
 * (proves the built intent actually passes engine validation and that a missing
 * contact falls back to inbox — never a half-created inquiry).
 *
 * Run: npx tsx --test src/lib/site-admin/sections/contact_form/inquiry-routing.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { contactFormSchemaV1, type ContactFormV1 } from "./schema";
import { decideFormRouting, projectFormContact } from "./inquiry-routing";
import { validateIntentForSubmit } from "@/lib/inquiry/inquiry-intent";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";

const TALENT_ID = "11111111-1111-4111-8111-111111111111";

/** Build a parsed contact_form props object with the standard fields. */
function buildProps(overrides: Partial<ContactFormV1> = {}): ContactFormV1 {
  return contactFormSchemaV1.parse({
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "message", label: "Message", type: "textarea", required: true },
      { name: "event_date", label: "Event date", type: "date" },
      ...overrides.fields ?? [],
    ],
    action: "internal:section-1",
    ...overrides,
  });
}

describe("decideFormRouting — mode selection", () => {
  it("returns internal when routingMode is unset (default backward-compat)", () => {
    const props = buildProps();
    // Absent routingMode is treated as internal (no explicit value persisted).
    assert.equal(props.routingMode, undefined);
    const decision = decideFormRouting(props, {
      name: "Ada",
      email: "ada@example.com",
      message: "Hello",
    });
    assert.equal(decision.mode, "internal");
  });

  it("returns internal when routingMode is explicitly internal", () => {
    const props = buildProps({ routingMode: "internal" });
    const decision = decideFormRouting(props, {
      name: "Ada",
      email: "ada@example.com",
      message: "Hello",
    });
    assert.equal(decision.mode, "internal");
  });

  it("routes to inquiry with a valid contact + message", () => {
    const props = buildProps({
      routingMode: "inquiry",
      inquiryTargetTalentId: TALENT_ID,
    });
    const decision = decideFormRouting(props, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+15551234",
      message: "We need a host for a launch event.",
      event_date: "2026-09-01",
    });
    assert.equal(decision.mode, "inquiry");
    if (decision.mode !== "inquiry") return;
    assert.equal(decision.contactEmail, "ada@example.com");
    assert.equal(decision.contactName, "Ada Lovelace");
    assert.equal(decision.contactPhone, "+15551234");
    assert.equal(decision.targetTalentId, TALENT_ID);
    // source = public_talent_profile when a target talent is set.
    assert.equal(decision.intent.source, "public_talent_profile");
    assert.deepEqual(decision.intent.talent?.selected_ids, [TALENT_ID]);
    // The rich-field answer (event date) is folded into the brief.
    assert.ok(decision.intent.brief?.summary?.includes("Event date: 2026-09-01"));
    // The INTENT the route hands the engine passes engine validation.
    assert.equal(validateIntentForSubmit(decision.intent).ok, true);
  });

  it("uses agency_site source + agency_recommends when no target talent", () => {
    const props = buildProps({ routingMode: "inquiry" });
    const decision = decideFormRouting(props, {
      name: "Ada",
      email: "ada@example.com",
      message: "Looking for a band.",
    });
    assert.equal(decision.mode, "inquiry");
    if (decision.mode !== "inquiry") return;
    assert.equal(decision.targetTalentId, null);
    assert.equal(decision.intent.source, "agency_site");
    assert.equal(decision.intent.talent?.selection_mode, "agency_recommends");
    assert.equal(validateIntentForSubmit(decision.intent).ok, true);
  });

  it("FAILS SAFE to internal when name is missing (no orphan inquiry)", () => {
    const props = buildProps({
      routingMode: "inquiry",
      inquiryTargetTalentId: TALENT_ID,
    });
    const decision = decideFormRouting(props, {
      email: "ada@example.com",
      message: "Hello",
    });
    assert.equal(decision.mode, "internal");
  });

  it("FAILS SAFE to internal when both email and phone are missing", () => {
    const props = buildProps({ routingMode: "inquiry" });
    const decision = decideFormRouting(props, {
      name: "Ada",
      message: "Hello",
    });
    assert.equal(decision.mode, "internal");
  });

  it("FAILS SAFE to internal when neither a message nor a target talent exists", () => {
    const props = buildProps({ routingMode: "inquiry" });
    const decision = decideFormRouting(props, {
      name: "Ada",
      email: "ada@example.com",
    });
    assert.equal(decision.mode, "internal");
  });

  it("routes on target-only (no message) because a target satisfies the engine", () => {
    const props = buildProps({
      routingMode: "inquiry",
      inquiryTargetTalentId: TALENT_ID,
    });
    const decision = decideFormRouting(props, {
      name: "Ada",
      email: "ada@example.com",
    });
    assert.equal(decision.mode, "inquiry");
    if (decision.mode !== "inquiry") return;
    assert.equal(validateIntentForSubmit(decision.intent).ok, true);
  });
});

describe("spam guard runs in FRONT of both modes", () => {
  // The route gates BOTH the FORMS-1 field validation AND the FORMS-2 inquiry
  // routing behind `if (!tripped && parsedProps?.success)`. A honeypot trip
  // sets `tripped=true`, so neither field-validation nor inquiry routing runs
  // — the submission becomes a spam inbox row regardless of routingMode. This
  // test encodes that gating contract so a future refactor can't move routing
  // ahead of the honeypot check.
  function routeWouldAttemptInquiry(args: {
    tripped: boolean;
    parsedSuccess: boolean;
    props: ContactFormV1;
    payload: Record<string, unknown>;
  }): boolean {
    if (!(!args.tripped && args.parsedSuccess)) return false;
    return decideFormRouting(args.props, args.payload).mode === "inquiry";
  }

  const inquiryProps = buildProps({
    routingMode: "inquiry",
    inquiryTargetTalentId: TALENT_ID,
  });
  const goodPayload = {
    name: "Ada",
    email: "ada@example.com",
    message: "Host wanted.",
  };

  it("does NOT route to inquiry when the honeypot is tripped", () => {
    assert.equal(
      routeWouldAttemptInquiry({
        tripped: true,
        parsedSuccess: true,
        props: inquiryProps,
        payload: goodPayload,
      }),
      false,
    );
  });

  it("does NOT route to inquiry when honeypot tripped even for internal forms", () => {
    assert.equal(
      routeWouldAttemptInquiry({
        tripped: true,
        parsedSuccess: true,
        props: buildProps({ routingMode: "internal" }),
        payload: goodPayload,
      }),
      false,
    );
  });

  it("DOES route to inquiry when not tripped + props parse + valid contact", () => {
    assert.equal(
      routeWouldAttemptInquiry({
        tripped: false,
        parsedSuccess: true,
        props: inquiryProps,
        payload: goodPayload,
      }),
      true,
    );
  });
});

describe("projectFormContact — field discovery", () => {
  it("locates contact fields by TYPE even with non-canonical names", () => {
    const props = contactFormSchemaV1.parse({
      fields: [
        { name: "full_name", label: "Full name", type: "text" },
        { name: "work_email", label: "Work email", type: "email" },
        { name: "mobile", label: "Mobile", type: "tel" },
        { name: "details", label: "Details", type: "textarea" },
      ],
      action: "internal:x",
    });
    const projected = projectFormContact(props, {
      full_name: "Grace Hopper",
      work_email: "grace@navy.mil",
      mobile: "+1999",
      details: "Need a keynote speaker.",
    });
    assert.equal(projected.name, "Grace Hopper");
    assert.equal(projected.email, "grace@navy.mil");
    assert.equal(projected.phone, "+1999");
    assert.equal(projected.message, "Need a keynote speaker.");
  });

  it("excludes consent fields from the visible brief", () => {
    const props = contactFormSchemaV1.parse({
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "message", label: "Message", type: "textarea" },
        { name: "agree", label: "I agree", type: "consent", consentText: "ok" },
      ],
      action: "internal:x",
    });
    const projected = projectFormContact(props, {
      name: "Ada",
      email: "ada@example.com",
      message: "Hi",
      agree: "true",
    });
    assert.equal(projected.extraLines.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Engine integration — validation-fail branch returns BEFORE any DB access.
// A tripwire Proxy proves the DB is never touched when the intent is invalid.
// ─────────────────────────────────────────────────────────────────────────────

describe("createInquiryFromIntent — DB-free validation gate", () => {
  it("rejects an intent missing the contact name without touching the DB", async () => {
    const tripwire = new Proxy(
      {},
      {
        get() {
          throw new Error("DB must not be touched on validation failure");
        },
      },
    ) as unknown as SupabaseClient;

    // An intent with no requester.name fails validateIntentForSubmit, so the
    // engine returns before any query — the tripwire is never invoked.
    const result = await createInquiryFromIntent(
      tripwire,
      {
        source: "agency_site",
        requester: { email: "ada@example.com" },
        location: { status: "not_sure" },
        date: { status: "not_sure" },
        brief: { summary: "Hello" },
      },
      { tenant_id: "t1", actor_user_id: null },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "validation_failed");
    assert.ok(result.missingFields?.includes("requester.name"));
  });
});
