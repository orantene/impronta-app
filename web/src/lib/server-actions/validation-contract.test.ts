/**
 * Characterization — the validation/enum substrate the server-action layer
 * is built on (`@/lib/admin/validation`). Every form-state action in
 * `src/lib/server-actions/**` funnels user input through `parseWithSchema`
 * + `trimmedString` / `booleanFromEquals` and validates status fields
 * against these `z.enum` schemas. This file pins CURRENT behavior,
 * including documented quirks. It asserts what the code does today, not
 * what it "should" do — suspected bugs are flagged with `it.skip`, never
 * fixed here.
 *
 * Pure: zero DB, zero auth, zero request scope.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  ACCOUNT_STATUS_VALUES,
  APP_ROLE_VALUES,
  WORKFLOW_STATUS_VALUES,
  VISIBILITY_VALUES,
  MEMBERSHIP_TIER_VALUES,
  BOOKING_STATUS_VALUES,
  INQUIRY_STATUS_VALUES,
  CLIENT_ACCOUNT_TYPE_VALUES,
  CLIENT_LOCATION_CREATE_TYPE_VALUES,
  CLIENT_LOCATION_TYPE_LABELS,
  INQUIRY_SOURCE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  PRICING_UNIT_VALUES,
  accountStatusSchema,
  appRoleSchema,
  workflowStatusSchema,
  visibilitySchema,
  membershipTierSchema,
  bookingStatusSchema,
  inquiryStatusSchema,
  clientAccountTypeSchema,
  inquirySourceChannelSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  pricingUnitSchema,
  trimmedString,
  booleanFromEquals,
  parseWithSchema,
  formatClientLocationAccountType,
} from "@/lib/admin/validation";

// ─────────────────────────────────────────────────────────────────────────
// Status enum value arrays — exact membership, ordering & era quirks
// ─────────────────────────────────────────────────────────────────────────

describe("status enum value arrays (exact current membership)", () => {
  it("ACCOUNT_STATUS_VALUES", () => {
    assert.deepEqual(
      [...ACCOUNT_STATUS_VALUES],
      ["registered", "onboarding", "active", "suspended"],
    );
  });

  it("APP_ROLE_VALUES", () => {
    assert.deepEqual(
      [...APP_ROLE_VALUES],
      ["client", "talent", "agency_staff", "super_admin"],
    );
  });

  it("WORKFLOW_STATUS_VALUES", () => {
    assert.deepEqual(
      [...WORKFLOW_STATUS_VALUES],
      ["draft", "submitted", "under_review", "approved", "hidden", "archived"],
    );
  });

  it("VISIBILITY_VALUES", () => {
    assert.deepEqual([...VISIBILITY_VALUES], ["hidden", "private", "public"]);
  });

  it("QUIRK: MEMBERSHIP_TIER_VALUES leads with an empty string (`\"\"` is a valid tier)", () => {
    assert.deepEqual(
      [...MEMBERSHIP_TIER_VALUES],
      ["", "free", "free_trial", "premium", "featured"],
    );
    assert.equal(MEMBERSHIP_TIER_VALUES[0], "");
  });

  it("BOOKING_STATUS_VALUES", () => {
    assert.deepEqual(
      [...BOOKING_STATUS_VALUES],
      [
        "draft",
        "tentative",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "archived",
      ],
    );
  });

  it("QUIRK: INQUIRY_STATUS_VALUES mixes 10 legacy + 8 Phase-2 canonical (18 total, no dupes)", () => {
    const legacy = [
      "new",
      "reviewing",
      "waiting_for_client",
      "talent_suggested",
      "in_progress",
      "qualified",
      "converted",
      "closed",
      "closed_lost",
      "archived",
    ];
    const canonical = [
      "draft",
      "submitted",
      "coordination",
      "offer_pending",
      "approved",
      "booked",
      "rejected",
      "expired",
    ];
    assert.deepEqual([...INQUIRY_STATUS_VALUES], [...legacy, ...canonical]);
    assert.equal(INQUIRY_STATUS_VALUES.length, 18);
    assert.equal(
      new Set(INQUIRY_STATUS_VALUES).size,
      18,
      "no value appears in both eras",
    );
    // Both eras coexist in one schema — legacy `closed` and canonical
    // `rejected` are simultaneously valid.
    assert.ok(INQUIRY_STATUS_VALUES.includes("closed"));
    assert.ok(INQUIRY_STATUS_VALUES.includes("rejected"));
  });

  it("CLIENT_ACCOUNT_TYPE_VALUES — 14 incl. legacy brand/agency", () => {
    assert.equal(CLIENT_ACCOUNT_TYPE_VALUES.length, 14);
    assert.ok(CLIENT_ACCOUNT_TYPE_VALUES.includes("brand"));
    assert.ok(CLIENT_ACCOUNT_TYPE_VALUES.includes("agency"));
  });

  it("PAYMENT_METHOD / PAYMENT_STATUS / PRICING_UNIT value sets", () => {
    assert.deepEqual([...PAYMENT_METHOD_VALUES], ["cash", "transfer", "other"]);
    assert.deepEqual(
      [...PAYMENT_STATUS_VALUES],
      ["unpaid", "partial", "paid", "cancelled"],
    );
    assert.deepEqual(
      [...PRICING_UNIT_VALUES],
      ["hour", "day", "week", "event"],
    );
  });
});

describe("client-location enum invariants", () => {
  it("every CLIENT_LOCATION_CREATE_TYPE_VALUES ∈ CLIENT_ACCOUNT_TYPE_VALUES", () => {
    const account = new Set<string>(CLIENT_ACCOUNT_TYPE_VALUES);
    for (const v of CLIENT_LOCATION_CREATE_TYPE_VALUES) {
      assert.ok(account.has(v), `${v} not in CLIENT_ACCOUNT_TYPE_VALUES`);
    }
  });

  it("QUIRK: create-type list deliberately omits legacy `brand` + `agency`", () => {
    const create = new Set<string>(CLIENT_LOCATION_CREATE_TYPE_VALUES);
    assert.equal(create.has("brand"), false);
    assert.equal(create.has("agency"), false);
    assert.equal(CLIENT_LOCATION_CREATE_TYPE_VALUES.length, 12);
  });

  it("CLIENT_LOCATION_TYPE_LABELS keys === CLIENT_LOCATION_CREATE_TYPE_VALUES set", () => {
    assert.deepEqual(
      Object.keys(CLIENT_LOCATION_TYPE_LABELS).sort(),
      [...CLIENT_LOCATION_CREATE_TYPE_VALUES].sort(),
    );
  });
});

describe("INQUIRY_SOURCE_CHANNEL_VALUES (mirrors the PG enum)", () => {
  it("17 values: 8 legacy/operational + 9 Plan §7 provenance", () => {
    const legacyOps = [
      "directory_guest",
      "directory_client",
      "phone",
      "whatsapp",
      "email",
      "admin",
      "other",
      "pitch",
    ];
    const plan = [
      "direct_client_dashboard",
      "discover_single_talent",
      "discover_shortlist",
      "saved_talent",
      "public_talent_profile",
      "agency_site",
      "hub_site",
      "admin_created",
      "book_again",
    ];
    assert.deepEqual(
      [...INQUIRY_SOURCE_CHANNEL_VALUES],
      [...legacyOps, ...plan],
    );
    assert.equal(INQUIRY_SOURCE_CHANNEL_VALUES.length, 17);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// z.enum schemas — accept members, reject unknowns, zod-4 issue shape
// ─────────────────────────────────────────────────────────────────────────

describe("z.enum schemas accept exactly their value set", () => {
  const cases: Array<[string, z.ZodType, readonly string[]]> = [
    ["accountStatusSchema", accountStatusSchema, ACCOUNT_STATUS_VALUES],
    ["appRoleSchema", appRoleSchema, APP_ROLE_VALUES],
    ["workflowStatusSchema", workflowStatusSchema, WORKFLOW_STATUS_VALUES],
    ["visibilitySchema", visibilitySchema, VISIBILITY_VALUES],
    ["membershipTierSchema", membershipTierSchema, MEMBERSHIP_TIER_VALUES],
    ["bookingStatusSchema", bookingStatusSchema, BOOKING_STATUS_VALUES],
    ["inquiryStatusSchema", inquiryStatusSchema, INQUIRY_STATUS_VALUES],
    [
      "clientAccountTypeSchema",
      clientAccountTypeSchema,
      CLIENT_ACCOUNT_TYPE_VALUES,
    ],
    [
      "inquirySourceChannelSchema",
      inquirySourceChannelSchema,
      INQUIRY_SOURCE_CHANNEL_VALUES,
    ],
    ["paymentMethodSchema", paymentMethodSchema, PAYMENT_METHOD_VALUES],
    ["paymentStatusSchema", paymentStatusSchema, PAYMENT_STATUS_VALUES],
    ["pricingUnitSchema", pricingUnitSchema, PRICING_UNIT_VALUES],
  ];

  for (const [name, schema, values] of cases) {
    it(`${name}: every member parses to itself`, () => {
      for (const v of values) {
        const r = schema.safeParse(v);
        assert.equal(r.success, true, `${name} rejected member ${JSON.stringify(v)}`);
        if (r.success) assert.equal(r.data, v);
      }
    });

    it(`${name}: rejects an unknown value with zod-4 invalid_value`, () => {
      const r = schema.safeParse("__definitely_not_a_member__");
      assert.equal(r.success, false);
      if (!r.success) {
        assert.equal(r.error.issues[0]?.code, "invalid_value");
        assert.ok(
          (r.error.issues[0]?.message ?? "").length > 0,
          "zod produces a non-empty message",
        );
      }
    });
  }

  it("membershipTierSchema accepts the empty string (the leading `\"\"` member)", () => {
    const r = membershipTierSchema.safeParse("");
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data, "");
  });

  it("schemas reject non-string inputs (number/null/undefined)", () => {
    for (const bad of [123, null, undefined, {}, []]) {
      assert.equal(appRoleSchema.safeParse(bad).success, false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseWithSchema — the universal form-input gate
// ─────────────────────────────────────────────────────────────────────────

describe("parseWithSchema", () => {
  const userSchema = z.object({
    name: z.string().min(1, "Name is required."),
    age: z.number().int("Age must be a whole number."),
  });

  it("success → { data } with parsed (typed) value, no `error` key", () => {
    const r = parseWithSchema(userSchema, { name: "Mara", age: 30 });
    assert.ok("data" in r);
    assert.equal("error" in r, false);
    if ("data" in r) assert.deepEqual(r.data, { name: "Mara", age: 30 });
  });

  it("failure → { error } carrying ONLY the first issue's message", () => {
    // Both fields invalid; field declaration order is name → age.
    const r = parseWithSchema(userSchema, { name: "", age: 1.5 });
    assert.ok("error" in r);
    if ("error" in r) assert.equal(r.error, "Name is required.");
  });

  it("QUIRK: only issues[0] is surfaced — later field errors are dropped", () => {
    const r = parseWithSchema(userSchema, { name: "ok", age: 1.5 });
    assert.ok("error" in r);
    if ("error" in r) assert.equal(r.error, "Age must be a whole number.");
  });

  it("fallback message when an issue carries no custom message", () => {
    // Bare z.string() → zod-generated message; parseWithSchema still
    // surfaces issues[0].message (never the literal fallback here,
    // because zod always supplies a message).
    const r = parseWithSchema(z.string(), 123);
    assert.ok("error" in r);
    if ("error" in r) assert.ok(r.error.length > 0);
  });

  it("discriminant is checked via `\"error\" in r`; success data with an `error` field is NOT mis-detected", () => {
    // The wrapper is { data: T } on success — `"error" in wrapper` looks
    // at the WRAPPER keys, so a payload that itself has `error` is safe.
    const s = z.object({ error: z.string() });
    const r = parseWithSchema(s, { error: "payload-level error string" });
    assert.equal("error" in r, false);
    assert.ok("data" in r);
    if ("data" in r) assert.deepEqual(r.data, { error: "payload-level error string" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// trimmedString / booleanFromEquals — FormData coercion contracts
// ─────────────────────────────────────────────────────────────────────────

describe("trimmedString", () => {
  it("absent key → empty string (null ?? \"\" → String → trim)", () => {
    assert.equal(trimmedString(new FormData(), "missing"), "");
  });

  it("trims surrounding whitespace", () => {
    const fd = new FormData();
    fd.set("k", "  hello world  ");
    assert.equal(trimmedString(fd, "k"), "hello world");
  });

  it("non-string FormData value is String()-coerced (numbers stringify)", () => {
    const fd = new FormData();
    fd.set("n", String(42));
    assert.equal(trimmedString(fd, "n"), "42");
  });

  it("QUIRK: a File value stringifies to its object tag, not its contents", () => {
    const fd = new FormData();
    fd.set("f", new File(["abc"], "a.txt", { type: "text/plain" }));
    // `String(File)` → "[object File]" (or "[object Object]"); never "abc".
    const out = trimmedString(fd, "f");
    assert.ok(out.startsWith("[object "), `got: ${out}`);
    assert.equal(out.includes("abc"), false);
  });
});

describe("booleanFromEquals", () => {
  it("default expected is the exact string \"true\"", () => {
    const fd = new FormData();
    fd.set("b", "true");
    assert.equal(booleanFromEquals(fd, "b"), true);
  });

  it("QUIRK: strict, case-sensitive === — \"True\"/\"1\"/absent are all false", () => {
    const fd = new FormData();
    fd.set("b", "True");
    assert.equal(booleanFromEquals(fd, "b"), false);
    fd.set("b", "1");
    assert.equal(booleanFromEquals(fd, "b"), false);
    assert.equal(booleanFromEquals(new FormData(), "b"), false);
  });

  it("custom `expected` argument is honored verbatim", () => {
    const fd = new FormData();
    fd.set("mode", "on");
    assert.equal(booleanFromEquals(fd, "mode", "on"), true);
    assert.equal(booleanFromEquals(fd, "mode", "ON"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// formatClientLocationAccountType — label resolution + fallbacks
// ─────────────────────────────────────────────────────────────────────────

describe("formatClientLocationAccountType", () => {
  it("`other` + non-blank detail → `Other — <trimmed detail>` (em-dash U+2014)", () => {
    const out = formatClientLocationAccountType("other", "  Yacht charter  ");
    assert.equal(out, "Other — Yacht charter");
  });

  it("QUIRK: `other` + null/blank detail falls through to the label `Other`", () => {
    assert.equal(formatClientLocationAccountType("other", null), "Other");
    assert.equal(formatClientLocationAccountType("other", "   "), "Other");
    assert.equal(formatClientLocationAccountType("other", undefined), "Other");
  });

  it("known create-type → its human label", () => {
    assert.equal(
      formatClientLocationAccountType("real_estate_company", null),
      "Real estate office",
    );
    assert.equal(
      formatClientLocationAccountType("office_company", null),
      "Office / Company location",
    );
  });

  it("QUIRK: legacy `brand`/`agency` are NOT in the label map → returned verbatim", () => {
    assert.equal(formatClientLocationAccountType("brand", null), "brand");
    assert.equal(formatClientLocationAccountType("agency", null), "agency");
  });

  it("QUIRK: unknown type → global underscore→space replace (no title-casing)", () => {
    assert.equal(
      formatClientLocationAccountType("some_unknown_kind", null),
      "some unknown kind",
    );
  });
});
