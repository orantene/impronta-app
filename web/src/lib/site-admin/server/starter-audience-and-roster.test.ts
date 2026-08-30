/**
 * REGRESSION — audience personalisation was 100% dead, and a business
 * workspace was handed three fake models.
 *
 * `heroCopyFor` writes four different homepage heroes so that a solo
 * photographer and a wedding band do not both open a site announcing they
 * "represent makeup, hair, photography, and styling professionals". Three call
 * sites reach the seed from the provisioner. The two CRASH-RECOVERY paths
 * passed `audience: lead.audience`; the FRESH-CREATION path — the only one a
 * real first-run customer takes — omitted it, so `buildFreeStarterEntries`
 * silently defaulted every new workspace to "agency".
 *
 * It shipped green because the tests called `buildFreeStarterEntries` directly.
 * These tests therefore assert the WIRING: that every provisioning call site
 * passes an audience, that the funnel's default is the seed's default, and that
 * a business workspace's roster seed and roster section are actually gated.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_SIGNUP_AUDIENCE } from "@/lib/saas/workspace-signup";

import {
  buildFreeStarterEntries,
  starterAudienceHasRoster,
  type StarterAudience,
} from "./onboard-starter-content-entries";
import { seedFreeStarterRosterProfiles } from "./onboard-starter-roster";

const SRC = path.join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

function heroHeadline(audience?: StarterAudience): string {
  const entries = buildFreeStarterEntries("Studio Name", audience);
  const hero = entries.find((entry) => entry.slotKey === "hero");
  return String((hero?.propsOverride as { headline?: string })?.headline ?? "");
}

// ── FIX 3: the audience actually reaches the seed ──────────────────────────

test("every provisioning call site hands the seed an audience", () => {
  const source = read("lib/saas/workspace-signup.server.ts");
  const scaffoldCalls = source.match(/ensureWorkspaceScaffold\(\{/g) ?? [];
  const audiencePasses = source.match(/\n\s*audience: lead\.audience,/g) ?? [];
  assert.ok(scaffoldCalls.length >= 3, "expected the three provisioning paths");
  assert.equal(
    audiencePasses.length,
    scaffoldCalls.length,
    "one of the ensureWorkspaceScaffold calls is not passing the audience -- that was the whole bug, and the fresh-creation path is the one that matters",
  );
});

test("the four audiences write four different heroes", () => {
  const headlines = new Set(
    (["operator", "agency", "organization", "business"] as const).map(heroHeadline),
  );
  assert.equal(headlines.size, 4);
});

test("the funnel's default audience is the seed's default audience", () => {
  // The funnel fell back to "operator" while the seed fell back to "agency", so
  // a visitor who never touched the radio got the wrong homepage either way.
  assert.equal(DEFAULT_SIGNUP_AUDIENCE, "operator");
  assert.equal(heroHeadline(), heroHeadline(DEFAULT_SIGNUP_AUDIENCE));
  assert.match(
    read("app/(marketing)/get-started/page.tsx"),
    /return DEFAULT_SIGNUP_AUDIENCE;/,
    "mapAudience must fall back to the shared constant, not a second literal",
  );
});

test("the signup blurb is selected, stamped, and threaded to the seed", () => {
  const provisioner = read("lib/saas/workspace-signup.server.ts");
  assert.match(
    provisioner,
    /"id, email, name, business_name, business_description,/,
    "loadLead must select business_description or it never leaves the lead row",
  );
  assert.match(
    provisioner,
    /\[SIGNUP_BUSINESS_DESCRIPTION_KEY\]:/,
    "the agencies insert must stamp the blurb alongside the other signup_* keys",
  );
  const scaffoldCalls = provisioner.match(/ensureWorkspaceScaffold\(\{/g) ?? [];
  const blurbPasses =
    provisioner.match(/\n\s*businessDescription: lead\.business_description,/g) ?? [];
  assert.equal(blurbPasses.length, scaffoldCalls.length);
  assert.match(
    read("lib/site-admin/server/onboard-starter-content.ts"),
    /persistSignupBusinessDescription\(client, \{/,
    "onboardStarterContent must park the blurb on the workspace",
  );
  assert.match(
    read("lib/site-admin/server/onboard-starter-content.ts"),
    /resolveSignupStarterTreeForOnboard\(/,
    "the seed must run AI-at-signup (select + adapt) before the Lab default",
  );
  assert.match(
    read("lib/site-admin/server/onboard-starter-content.ts"),
    /businessDescription: params\.businessDescription/,
    "the signup blurb must reach the AI-at-signup resolver",
  );
});

// ── FIX 4: a business workspace represents nobody ──────────────────────────

test("only a business audience is roster-free", () => {
  assert.equal(starterAudienceHasRoster("business"), false);
  for (const audience of ["operator", "agency", "organization"] as const) {
    assert.equal(starterAudienceHasRoster(audience), true, audience);
  }
});

test("a business workspace's starter homepage has no roster section", () => {
  const business = buildFreeStarterEntries("Casa Verde", "business");
  assert.equal(
    business.some((entry) => entry.sectionTypeKey === "featured_talent"),
    false,
    "a restaurant does not have featured professionals",
  );
  // Everything else about the page is unchanged.
  assert.deepEqual(
    business.map((entry) => entry.slotKey),
    ["hero", "services", "final_cta"],
  );
});

test("a roster workspace's starter homepage is untouched", () => {
  const agency = buildFreeStarterEntries("Studio Name", "agency");
  assert.deepEqual(
    agency.map((entry) => entry.slotKey),
    ["hero", "services", "featured", "final_cta"],
  );
});

test("a business workspace's CTAs do not point at the talent directory", () => {
  const hrefs = (audience: StarterAudience) => [
    ...new Set(
      (JSON.stringify(buildFreeStarterEntries("Name", audience)).match(
        /"href":"([^"]+)"/g,
      ) ?? []).map((raw) => raw.slice('"href":"'.length, -1)),
    ),
  ];
  // `/directory` 404s for a business workspace now that the route is guarded,
  // so pointing its seeded CTAs there would be a dead link on a page the
  // product wrote for them. `/book` is seeded unconditionally.
  assert.deepEqual(hrefs("business"), ["/book"]);
  assert.deepEqual(hrefs("agency"), ["/directory"]);
});

test("the public /directory route refuses a business workspace", () => {
  assert.match(
    read("app/(public)/directory/page.tsx"),
    /await assertRosterWorkspace\(tenantId\);/,
    "the ONE public roster surface that had no workspace_type check",
  );
});

// ── FIX 4: the demo-roster seed itself ─────────────────────────────────────

type RpcCall = { name: string };

function rosterFakeClient(workspaceType: string | null): {
  client: SupabaseClient;
  rpcCalls: RpcCall[];
  inserts: string[];
} {
  const rpcCalls: RpcCall[] = [];
  const inserts: string[] = [];
  const client = {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        in() {
          return builder;
        },
        is() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        insert() {
          inserts.push(table);
          return builder;
        },
        single() {
          return Promise.resolve({ data: null, error: { message: "stop" } });
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              plan_tier: "free",
              talent_seat_limit: 5,
              workspace_type: workspaceType,
            },
            error: null,
          });
        },
        then(resolve: (value: { data: null; count: number; error: null }) => unknown) {
          return Promise.resolve({ data: null, count: 0, error: null }).then(resolve);
        },
      };
      return builder;
    },
    rpc(name: string) {
      rpcCalls.push({ name });
      return Promise.resolve({ data: null, error: { message: "stop" } });
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls, inserts };
}

test("the demo roster seed never runs for a business workspace", async () => {
  const { client, rpcCalls, inserts } = rosterFakeClient("business");
  const seeded = await seedFreeStarterRosterProfiles({
    client,
    tenantId: "tenant-1",
    actorProfileId: "actor-1",
  });
  assert.equal(seeded, 0);
  assert.deepEqual(rpcCalls, [], "it must not even reach profile-code generation");
  assert.deepEqual(
    inserts,
    [],
    "Luna Alvarez, Mateo Rossi and Sofia Bennett do not work at a restaurant",
  );
});

test("the demo roster seed still runs for a talent workspace", async () => {
  for (const workspaceType of ["talent", null, "who-knows"]) {
    const { client, rpcCalls } = rosterFakeClient(workspaceType);
    await seedFreeStarterRosterProfiles({
      client,
      tenantId: "tenant-1",
      actorProfileId: "actor-1",
    });
    // The gate fails OPEN toward "talent": an unknown or missing workspace_type
    // must never silently strip an agency's starter roster.
    assert.ok(
      rpcCalls.length > 0,
      `workspace_type=${String(workspaceType)} must still seed`,
    );
  }
});
