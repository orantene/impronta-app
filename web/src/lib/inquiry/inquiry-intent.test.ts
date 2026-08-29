/**
 * CHARACTERIZATION TEST — inquiry-intent.ts (pure validators + adapter)
 * plus the DB-free validation-fail branch of createInquiryFromIntent.
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 + §5). The inquiry
 * CREATION path (submitInquiry / createInquiryFromIntent) is DB-bound;
 * per the lane scope we characterize ONLY the pure helpers it funnels
 * through (validators / mappers) and the one branch of
 * createInquiryFromIntent that returns BEFORE any DB access. The DB is
 * not mocked elaborately — a tripwire Proxy proves it is never touched
 * on validation failure.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-intent.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  INQUIRY_INTENT_SOURCES,
  computeMissingInfoFlags,
  intentToSubmitInquiryInput,
  validateIntentForSubmit,
  type InquiryIntent,
  type IntentAdapterContext,
} from "./inquiry-intent";
import { createInquiryFromIntent } from "./inquiry-intent-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Source enum
// ─────────────────────────────────────────────────────────────────────────────

describe("INQUIRY_INTENT_SOURCES", () => {
  it("includes offering_request after the original 10 provenance values", () => {
    assert.deepEqual(
      [...INQUIRY_INTENT_SOURCES],
      [
        "direct_client_dashboard",
        "discover_single_talent",
        "discover_shortlist",
        "saved_talent",
        "public_talent_profile",
        "agency_site",
        "hub_site",
        "pitch",
        "admin_created",
        "book_again",
        "offering_request",
      ],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateIntentForSubmit — required-field gate (§17)
// ─────────────────────────────────────────────────────────────────────────────

describe("validateIntentForSubmit", () => {
  it("an empty intent fails with all 5 missing fields, in push order, + computed flags", () => {
    const r = validateIntentForSubmit({ source: "admin_created", requester: {} });
    assert.deepEqual(r, {
      ok: false,
      missingFields: [
        "requester.name",
        "requester.email_or_phone",
        "brief.summary_or_talent",
        "location.city_or_status",
        "date.event_date_or_status",
      ],
      missingInfoFlags: [
        "exact_time_missing",
        "budget_not_provided",
        "talent_count_unknown",
        "usage_rights_unclear",
        "wardrobe_unclear",
        "files_not_added",
      ],
    });
  });

  it("QUIRK: whitespace-only name / email are treated as missing (trim gate)", () => {
    const r = validateIntentForSubmit({
      source: "admin_created",
      requester: { name: "   ", email: "  " },
      brief: { summary: "x" },
      location: { status: "online" },
      date: { status: "flexible" },
    });
    assert.equal(r.ok, false);
    assert.ok(r.ok === false && r.missingFields.includes("requester.name"));
    assert.ok(r.ok === false && r.missingFields.includes("requester.email_or_phone"));
  });

  it("phone alone satisfies email_or_phone; email alone also satisfies", () => {
    const baseOk = {
      source: "admin_created" as const,
      brief: { summary: "x" },
      location: { status: "online" as const },
      date: { status: "flexible" as const },
    };
    assert.equal(
      validateIntentForSubmit({ ...baseOk, requester: { name: "J", phone: "555" } }).ok,
      true,
    );
    assert.equal(
      validateIntentForSubmit({ ...baseOk, requester: { name: "J", email: "j@x.co" } }).ok,
      true,
    );
  });

  it("brief.summary OR non-empty talent.selected_ids satisfies; [] does NOT", () => {
    const baseOk = {
      source: "admin_created" as const,
      requester: { name: "J", email: "j@x.co" },
      location: { status: "online" as const },
      date: { status: "flexible" as const },
    };
    assert.equal(validateIntentForSubmit({ ...baseOk, brief: { summary: "need hosts" } }).ok, true);
    assert.equal(
      validateIntentForSubmit({ ...baseOk, talent: { selected_ids: ["tp1"] } }).ok,
      true,
    );
    const empty = validateIntentForSubmit({ ...baseOk, talent: { selected_ids: [] } });
    assert.equal(empty.ok, false);
    assert.ok(empty.ok === false && empty.missingFields.includes("brief.summary_or_talent"));
  });

  it("location.city OR location.status satisfies; whitespace city does NOT", () => {
    const baseOk = {
      source: "admin_created" as const,
      requester: { name: "J", email: "j@x.co" },
      brief: { summary: "x" },
      date: { status: "flexible" as const },
    };
    assert.equal(validateIntentForSubmit({ ...baseOk, location: { city: "Tulum" } }).ok, true);
    assert.equal(validateIntentForSubmit({ ...baseOk, location: { status: "online" } }).ok, true);
    const ws = validateIntentForSubmit({ ...baseOk, location: { city: "   " } });
    assert.ok(ws.ok === false && ws.missingFields.includes("location.city_or_status"));
  });

  it("date.event_date OR date.status satisfies; whitespace event_date does NOT", () => {
    const baseOk = {
      source: "admin_created" as const,
      requester: { name: "J", email: "j@x.co" },
      brief: { summary: "x" },
      location: { status: "online" as const },
    };
    assert.equal(
      validateIntentForSubmit({ ...baseOk, date: { event_date: "2026-07-01" } }).ok,
      true,
    );
    assert.equal(validateIntentForSubmit({ ...baseOk, date: { status: "exact" } }).ok, true);
    const ws = validateIntentForSubmit({ ...baseOk, date: { event_date: "  " } });
    assert.ok(ws.ok === false && ws.missingFields.includes("date.event_date_or_status"));
  });

  it("a valid minimal intent returns { ok:true, missingInfoFlags } with NO missingFields key", () => {
    const r = validateIntentForSubmit({
      source: "admin_created",
      requester: { name: "Jane", email: "jane@x.co" },
      brief: { summary: "Need 2 hosts" },
      location: { status: "online" },
      date: { status: "flexible" },
    });
    assert.equal(r.ok, true);
    assert.ok(r.ok === true && Array.isArray(r.missingInfoFlags));
    assert.equal(Object.prototype.hasOwnProperty.call(r, "missingFields"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeMissingInfoFlags — soft prompts (§16)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeMissingInfoFlags", () => {
  it("empty intent → exactly 6 flags, in push order", () => {
    assert.deepEqual(computeMissingInfoFlags({ source: "admin_created", requester: {} }), [
      "exact_time_missing",
      "budget_not_provided",
      "talent_count_unknown",
      "usage_rights_unclear",
      "wardrobe_unclear",
      "files_not_added",
    ]);
  });

  it("a fully-specified intent → no flags", () => {
    assert.deepEqual(
      computeMissingInfoFlags({
        source: "admin_created",
        requester: {},
        date: { start_time: "18:00" },
        location: { status: "confirmed" },
        budget: { preference: "total_budget" },
        talent: { count_needed: 2 },
        brief: { media_usage: "social", wardrobe_notes: "black tie" },
        files: [{ name: "b.pdf", url: "https://x/b.pdf" }],
      }),
      [],
    );
  });

  it("venue_not_confirmed appears ONLY when location.status === 'unconfirmed'", () => {
    assert.ok(
      computeMissingInfoFlags({
        source: "admin_created",
        requester: {},
        location: { status: "unconfirmed" },
      }).includes("venue_not_confirmed"),
    );
    assert.ok(
      !computeMissingInfoFlags({
        source: "admin_created",
        requester: {},
        location: { status: "confirmed" },
      }).includes("venue_not_confirmed"),
    );
  });

  it("budget_not_provided fires when preference missing OR 'not_sure'; suppressed otherwise", () => {
    const f = (b: InquiryIntent["budget"]) =>
      computeMissingInfoFlags({ source: "admin_created", requester: {}, budget: b }).includes(
        "budget_not_provided",
      );
    assert.equal(f(undefined), true);
    assert.equal(f({ preference: "not_sure" }), true);
    assert.equal(f({ preference: "total_budget" }), false);
  });

  it("talent_count_unknown suppressed by agency_recommends OR count_needed>0 OR selected_ids", () => {
    const f = (t: InquiryIntent["talent"]) =>
      computeMissingInfoFlags({ source: "admin_created", requester: {}, talent: t }).includes(
        "talent_count_unknown",
      );
    assert.equal(f({ selection_mode: "agency_recommends" }), false);
    assert.equal(f({ count_needed: 2 }), false);
    assert.equal(f({ selected_ids: ["tp1"] }), false);
  });

  it("QUIRK: count_needed === 0 does NOT suppress talent_count_unknown (needs strictly > 0)", () => {
    assert.equal(
      computeMissingInfoFlags({
        source: "admin_created",
        requester: {},
        talent: { count_needed: 0 },
      }).includes("talent_count_unknown"),
      true,
    );
  });

  it("OBSERVATION: 'on_site_contact_missing' is a declared MissingInfoFlag the function NEVER emits", () => {
    // Pinned as a gap, not fixed: computeMissingInfoFlags has no branch that
    // can ever push "on_site_contact_missing", though the union declares it.
    const all = computeMissingInfoFlags({ source: "admin_created", requester: {} });
    assert.equal(all.includes("on_site_contact_missing"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// intentToSubmitInquiryInput — the rich→legacy adapter (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("intentToSubmitInquiryInput", () => {
  it("maps a rich intent end-to-end (trim, location join, trust precedence, referrer_page)", () => {
    const intent: InquiryIntent = {
      source: "discover_single_talent",
      source_context: { talent_profile_id: "tp1", referrer_page: "/client/discover?x=1" },
      requester: {
        name: "  Jane Doe  ",
        email: " jane@x.com ",
        phone: " +1 555 ",
        trust_level: "silver",
      },
      client: { company: "  Acme  " },
      location: {
        venue_name: "Hyatt",
        address: "1 Main",
        city: "Tulum",
        area: "Hotel Zone",
        country: "MX",
        status: "confirmed",
      },
      date: { event_date: " 2026-07-01 ", start_time: "18:00", status: "exact" },
      talent: { selected_ids: ["tp1", "tp2"], count_needed: 2, selection_mode: "i_know_who" },
      budget: { preference: "total_budget", amount: 5000, currency: "USD" },
      brief: { summary: "  Need two hosts  ", media_usage: "social", wardrobe_notes: "black tie" },
      files: [{ name: "brief.pdf", url: "https://x/brief.pdf" }],
      links: ["https://ref"],
    };
    const ctx: IntentAdapterContext = {
      tenant_id: "ten1",
      actor_user_id: "user1",
      guest_session_id: null,
      origin_domain: "improntamodels.com",
      source_workspace_id: "ws1",
      trust_level_at_submission: "gold",
      client_user_id: "client1",
    };

    assert.deepEqual(intentToSubmitInquiryInput(intent, ctx), {
      tenant_id: "ten1",
      contact_name: "Jane Doe",
      contact_email: "jane@x.com",
      contact_phone: "+1 555",
      company: "Acme",
      event_date: "2026-07-01",
      // QUIRK: country + notes are excluded; order is venue·address·city·area
      event_location: "Hyatt · 1 Main · Tulum · Hotel Zone",
      quantity: 2,
      message: "Need two hosts",
      event_type_id: null,
      raw_ai_query: "Need two hosts",
      interpreted_query: {
        schema_version: 1,
        // QUIRK: requester is carried through UN-trimmed (raw form values)
        requester: {
          name: "  Jane Doe  ",
          email: " jane@x.com ",
          phone: " +1 555 ",
          trust_level: "silver",
        },
        client: { company: "  Acme  " },
        location: {
          venue_name: "Hyatt",
          address: "1 Main",
          city: "Tulum",
          area: "Hotel Zone",
          country: "MX",
          status: "confirmed",
        },
        date: { event_date: " 2026-07-01 ", start_time: "18:00", status: "exact" },
        talent: { selected_ids: ["tp1", "tp2"], count_needed: 2, selection_mode: "i_know_who" },
        budget: { preference: "total_budget", amount: 5000, currency: "USD" },
        brief: { summary: "  Need two hosts  ", media_usage: "social", wardrobe_notes: "black tie" },
        files: [{ name: "brief.pdf", url: "https://x/brief.pdf" }],
        links: ["https://ref"],
        source: "discover_single_talent",
        source_context: { talent_profile_id: "tp1", referrer_page: "/client/discover?x=1" },
      },
      source_page: "/client/discover?x=1",
      source_channel: "discover_single_talent",
      source_context: {
        talent_profile_id: "tp1",
        referrer_page: "/client/discover?x=1",
        talent_ids: ["tp1", "tp2"],
      },
      origin_domain: "improntamodels.com",
      source_workspace_id: "ws1",
      // ctx.trust_level_at_submission wins over requester.trust_level
      trust_level_at_submission: "gold",
      client_user_id: "client1",
      talent_profile_ids: ["tp1", "tp2"],
      actorUserId: "user1",
      guest_session_id: null,
      initiator_role: "client",
      initiator_user_id: "user1",
    });
  });

  it("maps a minimal intent — nullish defaults + admin_created source path", () => {
    const out = intentToSubmitInquiryInput(
      { source: "admin_created", requester: {} },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.deepEqual(out, {
      tenant_id: "t",
      contact_name: "",
      contact_email: "",
      contact_phone: null,
      company: null,
      event_date: null,
      event_location: null,
      quantity: null,
      message: null,
      event_type_id: null,
      raw_ai_query: null,
      interpreted_query: {
        schema_version: 1,
        requester: {},
        client: {},
        location: {},
        date: {},
        talent: {},
        budget: {},
        brief: {},
        files: [],
        links: [],
        source: "admin_created",
        source_context: {},
      },
      // QUIRK: admin_created path has NO leading slash
      source_page: "admin-workspace-new-inquiry",
      source_channel: "admin_created",
      source_context: null,
      origin_domain: null,
      source_workspace_id: null,
      trust_level_at_submission: null,
      client_user_id: null,
      talent_profile_ids: [],
      actorUserId: null,
      guest_session_id: null,
      initiator_role: "admin",
      initiator_user_id: null,
    });
  });

  it("QUIRK: count_needed === 0 maps to quantity 0 (not null) — `?? null` keeps 0", () => {
    const out = intentToSubmitInquiryInput(
      { source: "admin_created", requester: {}, talent: { count_needed: 0 } },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.equal(out.quantity, 0);
  });

  it("source 'pitch' forces initiator_role 'admin'", () => {
    const out = intentToSubmitInquiryInput(
      { source: "pitch", requester: {} },
      { tenant_id: "t", actor_user_id: "u1" },
    );
    assert.equal(out.initiator_role, "admin");
  });

  it("CONTRACT: non-admin/non-pitch source → initiator_role 'client' for BOTH an authenticated actor AND an unauthenticated guest (intentional, not a bug)", () => {
    // initiator_role is the *direction of initiation* axis, NOT a guest
    // marker. A null actor (unauthenticated guest) is deliberately "client":
    //   • the DB CHECK on inquiries.initiator_role forbids 'guest' — the
    //     INSERT would fail at runtime;
    //   • guest-vs-authenticated travels on a separate axis (actorUserId /
    //     guest_session_id → is_guest in analytics + engine events);
    //   • this matches migration 20260514022934's documented backfill
    //     ("ELSE → 'client'; conservative; matches legacy guest path").
    // Previously flagged as a suspected latent bug (Lane E it.skip,
    // "looks wrong"); confirmed INTENTIONAL 2026-05-19 and the dead no-op
    // ternary collapsed. This active test locks the contract so it is not
    // re-"fixed" to "guest" a fourth time.
    const withActor = intentToSubmitInquiryInput(
      { source: "direct_client_dashboard", requester: {} },
      { tenant_id: "t", actor_user_id: "u1" },
    );
    const guest = intentToSubmitInquiryInput(
      { source: "direct_client_dashboard", requester: {} },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.equal(withActor.initiator_role, "client");
    assert.equal(guest.initiator_role, "client");
  });

  describe("formatEventLocation (reached via the adapter)", () => {
    const loc = (l: InquiryIntent["location"]) =>
      intentToSubmitInquiryInput(
        { source: "admin_created", requester: {}, location: l },
        { tenant_id: "t", actor_user_id: null },
      ).event_location;

    it("undefined location → null", () => assert.equal(loc(undefined), null));
    it("single part → no separator", () => assert.equal(loc({ city: "Tulum" }), "Tulum"));
    it("QUIRK: country + notes never appear in event_location", () =>
      assert.equal(loc({ country: "MX", notes: "by the pool" }), null));
    it("whitespace-only parts are filtered out → null", () =>
      assert.equal(loc({ venue_name: "  ", city: "   " }), null));
    it("order is venue · address · city · area", () =>
      assert.equal(
        loc({ area: "Zone", city: "Tulum", address: "1 Main", venue_name: "Hyatt" }),
        "Hyatt · 1 Main · Tulum · Zone",
      ));
  });

  describe("sourceToPagePath (reached via the adapter)", () => {
    const page = (intent: InquiryIntent) =>
      intentToSubmitInquiryInput(intent, { tenant_id: "t", actor_user_id: null }).source_page;

    const expected: Record<string, string> = {
      direct_client_dashboard: "/client",
      discover_single_talent: "/client/discover",
      discover_shortlist: "/client/discover",
      saved_talent: "/client/shortlists",
      public_talent_profile: "/t",
      agency_site: "/directory",
      hub_site: "/hub",
      pitch: "/share/pitch",
      admin_created: "admin-workspace-new-inquiry",
      book_again: "/client/bookings",
      offering_request: "/book",
    };
    for (const [source, path] of Object.entries(expected)) {
      it(`source "${source}" → "${path}"`, () => {
        assert.equal(page({ source: source as InquiryIntent["source"], requester: {} }), path);
      });
    }

    it("QUIRK: source_context.referrer_page is returned VERBATIM (incl. surrounding whitespace); trim is only the truthiness gate", () => {
      assert.equal(
        page({ source: "pitch", requester: {}, source_context: { referrer_page: "  /spaced  " } }),
        "  /spaced  ",
      );
    });
    it("all-whitespace referrer_page falls through to the source switch", () => {
      assert.equal(
        page({ source: "pitch", requester: {}, source_context: { referrer_page: "   " } }),
        "/share/pitch",
      );
    });
    it("non-string referrer_page falls through to the source switch", () => {
      assert.equal(
        page({ source: "pitch", requester: {}, source_context: { referrer_page: 123 } }),
        "/share/pitch",
      );
    });
  });

  it("trust_level_at_submission falls back ctx → requester.trust_level → null", () => {
    const fromRequester = intentToSubmitInquiryInput(
      { source: "admin_created", requester: { trust_level: "verified" } },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.equal(fromRequester.trust_level_at_submission, "verified");
  });

  it("client_user_id falls back ctx.client_user_id → ctx.actor_user_id → null", () => {
    assert.equal(
      intentToSubmitInquiryInput(
        { source: "admin_created", requester: {} },
        { tenant_id: "t", actor_user_id: "actorX" },
      ).client_user_id,
      "actorX",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createInquiryFromIntent — DB-free branch only (validation failure returns
// BEFORE submitInquiry, so the DB is never touched).
// ─────────────────────────────────────────────────────────────────────────────

describe("createInquiryFromIntent — validation-failure branch is DB-free", () => {
  // Tripwire: any property access on this throws. If createInquiryFromIntent
  // touched the DB on a validation failure, the test would throw instead of
  // returning the expected shape.
  const tripwireSupabase = new Proxy(
    {},
    {
      get() {
        throw new Error("DB MUST NOT be touched on a validation failure");
      },
    },
  ) as unknown as SupabaseClient;

  it("invalid intent → { ok:false, reason:'validation_failed', missingFields } and NO DB access", async () => {
    const res = await createInquiryFromIntent(
      tripwireSupabase,
      { source: "admin_created", requester: {} },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.deepEqual(res, {
      ok: false,
      reason: "validation_failed",
      missingFields: [
        "requester.name",
        "requester.email_or_phone",
        "brief.summary_or_talent",
        "location.city_or_status",
        "date.event_date_or_status",
      ],
    });
  });

  it("QUIRK: the createInquiryFromIntent failure result OMITS missingInfoFlags (unlike validateIntentForSubmit)", async () => {
    const res = await createInquiryFromIntent(
      tripwireSupabase,
      { source: "admin_created", requester: {} },
      { tenant_id: "t", actor_user_id: null },
    );
    assert.equal(Object.prototype.hasOwnProperty.call(res, "missingInfoFlags"), false);
  });
});
