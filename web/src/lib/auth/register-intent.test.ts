/**
 * P2 — guards for the single signup front door.
 *
 * Two failure classes this locks down:
 *
 * 1. COPY. `/register` addresses five flows off one page now. A missing or
 *    mis-mapped catalog key here means an invited talent reads "you'll choose
 *    whether you're Talent or a Client", or a Spanish visitor reads a raw key.
 *    So the mapping is asserted flow by flow AND every returned key is resolved
 *    against BOTH `messages/en.json` and `messages/es.json`.
 *
 * 2. REDIRECT PAYLOAD. `/talent/register`, `/client/register` and `/join` are
 *    now 308s. Those URLs are live in claim emails, marketing CTAs, saved
 *    page-builder link data and the talent portal's inquiry CTA
 *    (`/client/register?intent=inquiry&next=<deep link>`). Dropping a single
 *    param silently strands the funnel, which is the exact bug class the claim
 *    flow already hit once when `?invitation=` was dropped.
 */

import assert from "node:assert/strict";
import test from "node:test";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import {
  buildRegisterHref,
  parseRegisterIntent,
  readRegisterIntent,
  registerCopyKeys,
  REGISTER_INTENTS,
  resolveRegisterFlow,
  type RegisterFlow,
} from "./register-intent";

/* ─────────────────────────── intent parsing ─────────────────────────── */

test("parseRegisterIntent accepts the three intents, case/space tolerant", () => {
  assert.equal(parseRegisterIntent("talent"), "talent");
  assert.equal(parseRegisterIntent("client"), "client");
  assert.equal(parseRegisterIntent("operator"), "operator");
  assert.equal(parseRegisterIntent(" Talent "), "talent");
  assert.equal(parseRegisterIntent("OPERATOR"), "operator");
});

test("parseRegisterIntent rejects anything else instead of guessing", () => {
  for (const bad of ["", "admin", "talents", "agency", undefined, null, 7, {}]) {
    assert.equal(parseRegisterIntent(bad), null, `expected null for ${String(bad)}`);
  }
});

test("parseRegisterIntent takes the first value of a repeated param", () => {
  assert.equal(parseRegisterIntent(["client", "talent"]), "client");
});

test("readRegisterIntent prefers ?as= and falls back to the legacy ?role=", () => {
  assert.equal(readRegisterIntent({ as: "client" }), "client");
  // link-ref.ts coerces every legacy /talent/register href in saved builder
  // page data to /register?role=talent. Ignoring it is how those CTAs used to
  // land on the generic page.
  assert.equal(readRegisterIntent({ role: "talent" }), "talent");
  assert.equal(readRegisterIntent({ as: "talent", role: "client" }), "talent");
  // An unparseable `as` must not shadow a usable `role`.
  assert.equal(readRegisterIntent({ as: "nonsense", role: "client" }), "client");
  assert.equal(readRegisterIntent({}), null);
});

/* ──────────────────────────── flow precedence ───────────────────────── */

const NO_FLAGS = {
  workspaceSignup: false,
  claimInvite: false,
  rosterInvite: false,
  intent: null,
} as const;

test("plain /register is the generic flow", () => {
  assert.equal(resolveRegisterFlow(NO_FLAGS), "generic");
});

test("?as= maps to its own flow", () => {
  assert.equal(resolveRegisterFlow({ ...NO_FLAGS, intent: "talent" }), "talent");
  assert.equal(resolveRegisterFlow({ ...NO_FLAGS, intent: "client" }), "client");
  assert.equal(resolveRegisterFlow({ ...NO_FLAGS, intent: "operator" }), "operator");
});

test("the get-started funnel is the operator flow even without ?as=", () => {
  assert.equal(
    resolveRegisterFlow({ ...NO_FLAGS, workspaceSignup: true }),
    "operator",
  );
});

test("a concrete invitation outranks a generic ?as=", () => {
  // A claim link carries a specific existing profile; the page must say so
  // rather than pitch "join as talent".
  assert.equal(
    resolveRegisterFlow({ ...NO_FLAGS, claimInvite: true, intent: "talent" }),
    "claim",
  );
  assert.equal(
    resolveRegisterFlow({ ...NO_FLAGS, rosterInvite: true, intent: "client" }),
    "invite",
  );
  // Operator (the paying funnel) outranks everything.
  assert.equal(
    resolveRegisterFlow({
      ...NO_FLAGS,
      workspaceSignup: true,
      claimInvite: true,
      rosterInvite: true,
      intent: "talent",
    }),
    "operator",
  );
  // claim outranks invite.
  assert.equal(
    resolveRegisterFlow({ ...NO_FLAGS, claimInvite: true, rosterInvite: true }),
    "claim",
  );
});

/* ───────────────────────── copy-key mapping ─────────────────────────── */

const ALL_FLOWS: readonly RegisterFlow[] = [
  "operator",
  "claim",
  "invite",
  "talent",
  "client",
  "generic",
];

test("each flow maps to its own headline + submit key", () => {
  assert.equal(registerCopyKeys("generic").title, "public.auth.register.title");
  assert.equal(
    registerCopyKeys("generic").submit,
    "public.auth.register.emailSubmit",
  );

  assert.equal(
    registerCopyKeys("talent").title,
    "public.auth.roleRegister.talentTitle",
  );
  assert.equal(
    registerCopyKeys("talent").submit,
    "public.auth.roleRegister.talentSubmit",
  );

  assert.equal(
    registerCopyKeys("client").title,
    "public.auth.roleRegister.clientTitle",
  );
  assert.equal(
    registerCopyKeys("client").submit,
    "public.auth.roleRegister.clientSubmit",
  );

  assert.equal(
    registerCopyKeys("operator").title,
    "public.auth.register.operatorTitle",
  );
  // The operator funnel is a continuation, not a fresh signup: "Continue with
  // Google", not "Sign up with Google".
  assert.equal(
    registerCopyKeys("operator").google,
    "public.auth.register.googleContinue",
  );

  assert.equal(registerCopyKeys("invite").title, "public.auth.register.inviteTitle");
  assert.equal(
    registerCopyKeys("invite").submit,
    "public.auth.register.inviteSubmit",
  );
});

test("the claim headline switches to the named variant when the agency resolved", () => {
  assert.equal(registerCopyKeys("claim", false).title, "public.auth.register.claimTitle");
  assert.equal(
    registerCopyKeys("claim", true).title,
    "public.auth.register.claimTitleAgency",
  );
  // Everything else about the claim flow is name-independent.
  assert.equal(
    registerCopyKeys("claim", true).submit,
    "public.auth.register.claimSubmit",
  );
});

test("no two flows share a headline (a flow with the wrong copy is invisible in QA)", () => {
  const titles = ALL_FLOWS.map((f) => registerCopyKeys(f).title);
  assert.equal(new Set(titles).size, titles.length, titles.join(", "));
});

/* ───────────── every key exists in EN *and* ES (no raw keys) ───────────── */

function lookup(catalog: unknown, key: string): unknown {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

test("every copy key for every flow resolves in both message catalogs", () => {
  for (const flow of ALL_FLOWS) {
    for (const hasAgency of [false, true]) {
      const keys = registerCopyKeys(flow, hasAgency);
      for (const [slot, key] of Object.entries(keys)) {
        for (const [locale, catalog] of [
          ["en", en],
          ["es", es],
        ] as const) {
          const value = lookup(catalog, key);
          assert.equal(
            typeof value,
            "string",
            `${locale}.json is missing ${key} (${flow}.${slot})`,
          );
          assert.ok(
            (value as string).trim().length > 0,
            `${locale}.json has an empty ${key}`,
          );
        }
      }
    }
  }
});

test("the {agency} placeholder exists in every string that gets one substituted", () => {
  for (const key of [
    "public.auth.register.claimTitleAgency",
    "public.auth.register.claimDescription",
    "public.auth.register.inviteTitle",
    "public.auth.register.inviteDescription",
  ]) {
    for (const [locale, catalog] of [
      ["en", en],
      ["es", es],
    ] as const) {
      assert.ok(
        String(lookup(catalog, key)).includes("{agency}"),
        `${locale}.json ${key} lost its {agency} placeholder`,
      );
    }
  }
  // The claim description always names someone, so the fallback must exist.
  for (const catalog of [en, es]) {
    assert.equal(
      typeof lookup(catalog, "public.auth.register.claimAgencyFallback"),
      "string",
    );
  }
});

/* ──────────────────── redirect param preservation ───────────────────── */

function parse(href: string): { path: string; params: URLSearchParams } {
  const [path, query = ""] = href.split("?");
  return { path, params: new URLSearchParams(query) };
}

test("buildRegisterHref targets /register and stamps the intent", () => {
  for (const intent of REGISTER_INTENTS) {
    const { path, params } = parse(buildRegisterHref(intent));
    assert.equal(path, "/register");
    assert.equal(params.get("as"), intent);
    assert.equal([...params.keys()].length, 1);
  }
});

test("every inbound param survives the redirect", () => {
  // The real /client/register CTA from the talent portal.
  const href = buildRegisterHref("client", {
    intent: "inquiry",
    next: "/t/abc123?open=inquiry",
    error: "Something went wrong",
    utm_source: "newsletter",
  });
  const { path, params } = parse(href);
  assert.equal(path, "/register");
  assert.equal(params.get("as"), "client");
  assert.equal(params.get("intent"), "inquiry");
  assert.equal(params.get("next"), "/t/abc123?open=inquiry");
  assert.equal(params.get("error"), "Something went wrong");
  assert.equal(params.get("utm_source"), "newsletter");
});

test("the claim payload survives the redirect (the param that was dropped once already)", () => {
  const { params } = parse(
    buildRegisterHref("talent", {
      invitation: "6f1c0f4e-0000-4000-8000-000000000001",
      email: "talent+claim@example.com",
    }),
  );
  assert.equal(params.get("as"), "talent");
  assert.equal(params.get("invitation"), "6f1c0f4e-0000-4000-8000-000000000001");
  assert.equal(params.get("email"), "talent+claim@example.com");
});

test("repeated params keep every value, in order", () => {
  const { params } = parse(buildRegisterHref("talent", { tag: ["a", "b", "c"] }));
  assert.deepEqual(params.getAll("tag"), ["a", "b", "c"]);
});

test("an inbound as/role is replaced, never duplicated", () => {
  const { params } = parse(
    buildRegisterHref("talent", { as: "client", role: "operator", next: "/x" }),
  );
  assert.deepEqual(params.getAll("as"), ["talent"]);
  assert.equal(params.get("role"), null);
  assert.equal(params.get("next"), "/x");
});

test("undefined params are dropped, empty strings are kept", () => {
  const { params } = parse(
    buildRegisterHref("talent", { missing: undefined, blank: "" }),
  );
  assert.equal(params.has("missing"), false);
  assert.equal(params.get("blank"), "");
});

test("values are percent-encoded, so a next= deep link cannot inject params", () => {
  const href = buildRegisterHref("talent", {
    next: "/claim?invitation=abc&x=1",
  });
  // The literal `&` inside the value must be encoded, otherwise `x` would
  // arrive at /register as a top-level param.
  assert.ok(href.includes("next=%2Fclaim%3Finvitation%3Dabc%26x%3D1"), href);
  const { params } = parse(href);
  assert.equal(params.get("next"), "/claim?invitation=abc&x=1");
  assert.equal(params.has("x"), false);
});
