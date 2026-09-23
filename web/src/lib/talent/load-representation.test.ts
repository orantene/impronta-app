/**
 * load-representation.test.ts — regressions for two Phase 5 bugs in
 * `loadRepresentation`:
 *
 *   1. The platform hub roster row must not be listed as a second entry next
 *      to the talent's self page — they are the same Tulala page. The hub's
 *      roster row stays the source of truth for that merged entry's
 *      visibility.
 *   2. An entry that is not effectively visible (pending, roster-only,
 *      globally hidden, etc.) must not carry a public URL — its public page
 *      404s, so the UI must fall back to showing status instead of a link.
 *
 * Mocking strategy: a minimal chainable + thenable fake Supabase client
 * (table name -> canned {data, error}), injected through the
 * `LoadRepresentationDeps` seam so the real cookie/service-role clients are
 * never touched. `mock.module` is avoided (corrupts named exports under tsx
 * elsewhere in this repo) — this is a plain object, not a module mock.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRepresentation } from "./load-representation";

type CannedResponse = { data: unknown; error: unknown };

function fakeSupabase(responses: Record<string, CannedResponse>): SupabaseClient {
  const chainFor = (table: string) => {
    const result = responses[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      order: () => chain,
      in: () => chain,
      maybeSingle: () => Promise.resolve(result),
      then: (
        resolve: (value: CannedResponse) => void,
        reject: (reason: unknown) => void,
      ) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  return { from: chainFor } as unknown as SupabaseClient;
}

const HUB_AGENCY = {
  id: "tenant-hub",
  display_name: "Tulala",
  slug: "tulala",
  plan_tier: null,
  kind: "hub",
};

const REAL_AGENCY = {
  id: "tenant-acme",
  display_name: "Acme Talent",
  slug: "acme",
  plan_tier: "agency",
  kind: "agency",
};

function baseResponses(rosterRows: unknown[]): Record<string, CannedResponse> {
  return {
    talent_profiles: { data: { is_publicly_hidden: false }, error: null },
    agency_talent_roster: { data: rosterRows, error: null },
    agency_branding: { data: [], error: null },
    agency_domains: { data: [], error: null },
  };
}

test("hub roster row is folded into the self entry, not listed twice", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: HUB_AGENCY,
    },
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const hubEntries = result.entries.filter(
    (e) => e.tenantId === HUB_AGENCY.id && e.kind !== "self_page",
  );
  assert.equal(hubEntries.length, 0, "hub tenant must not appear as its own row");

  const selfEntries = result.entries.filter((e) => e.kind === "self_page");
  assert.equal(selfEntries.length, 1, "exactly one self/Tulala entry");
  assert.equal(selfEntries[0].effective, "live");
  assert.ok(selfEntries[0].publicUrl.includes("/t/sofia-001"));

  // The real agency is still listed as its own entry.
  const acmeEntries = result.entries.filter((e) => e.tenantId === REAL_AGENCY.id);
  assert.equal(acmeEntries.length, 1);
});

test("hub row visibility drives the merged self entry's effective status", async () => {
  const rosterRows = [
    {
      status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: HUB_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const selfEntry = result.entries.find((e) => e.kind === "self_page");
  assert.ok(selfEntry);
  assert.equal(selfEntry?.effective, "pending");
  assert.equal(selfEntry?.publicUrl, "", "pending self entry must not carry a public URL");
});

test("a non-visible agency entry (roster_only) carries no public URL", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "roster_only",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const acmeEntry = result.entries.find((e) => e.tenantId === REAL_AGENCY.id);
  assert.ok(acmeEntry);
  assert.equal(acmeEntry?.effective, "agency_hidden");
  assert.equal(acmeEntry?.publicUrl, "", "agency-hidden entry must not link to a 404");
});

test("a pending agency entry carries no public URL", async () => {
  const rosterRows = [
    {
      status: "pending",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const acmeEntry = result.entries.find((e) => e.tenantId === REAL_AGENCY.id);
  assert.ok(acmeEntry);
  assert.equal(acmeEntry?.effective, "pending");
  assert.equal(acmeEntry?.publicUrl, "");
});

test("a live agency entry with a registered custom domain uses that domain, not the path fallback", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const responses = baseResponses(rosterRows);
  responses.agency_domains = {
    data: [
      {
        tenant_id: REAL_AGENCY.id,
        hostname: "acmemodels.com",
        kind: "custom",
        status: "active",
        is_primary: true,
      },
    ],
    error: null,
  };

  const supabase = fakeSupabase(responses);
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const acmeEntry = result.entries.find((e) => e.tenantId === REAL_AGENCY.id);
  assert.equal(acmeEntry?.publicUrl, "https://acmemodels.com/t/sofia-001");
});

test("a live agency entry with no registered domain falls back to the /w/<slug> path form, not the retired flat form", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const acmeEntry = result.entries.find((e) => e.tenantId === REAL_AGENCY.id);
  assert.equal(acmeEntry?.publicUrl, "https://tulala.digital/w/acme/t/sofia-001");
});

const SECOND_HUB = {
  id: "tenant-hub-2",
  display_name: "Partner Hub",
  slug: "partner-hub",
  plan_tier: null,
  kind: "hub",
};

test("a SECOND hub membership is still listed; only the first is folded away", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: HUB_AGENCY,
    },
    {
      status: "active",
      created_at: "2026-03-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: SECOND_HUB,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  assert.equal(result.entries.filter((e) => e.kind === "self_page").length, 1);
  const second = result.entries.find((e) => e.tenantId === SECOND_HUB.id);
  assert.ok(second, "a real second hub membership must not vanish into the dedupe");
  assert.equal(second?.kind, "hub");
  assert.equal(second?.publicUrl, "https://tulala.digital/t/sofia-001");
});

test("the self link follows talent_has_public_roster, not the hub row's own visibility", async () => {
  // Hub row is roster-only, so the hub chip says "agency_hidden" — but
  // tulala.digital/t/<code> is gated by talent_select_public, which is true as
  // soon as ANY active roster row is site_visible. The link resolves; hiding
  // it would be a false negative.
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "roster_only",
      talent_site_hidden: false,
      agencies: HUB_AGENCY,
    },
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const selfEntry = result.entries.find((e) => e.kind === "self_page");
  assert.equal(selfEntry?.effective, "agency_hidden", "chip keeps the hub row's truth");
  assert.equal(selfEntry?.publicUrl, "https://tulala.digital/t/sofia-001");
});

test("talent_site_hidden on the hub row does not kill the self link", async () => {
  // talent_has_public_roster() does not consult talent_site_hidden at all.
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: true,
      agencies: HUB_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const selfEntry = result.entries.find((e) => e.kind === "self_page");
  assert.equal(selfEntry?.effective, "you_hid");
  assert.equal(selfEntry?.publicUrl, "https://tulala.digital/t/sofia-001");
});

test("a globally hidden talent gets no links at all", async () => {
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: HUB_AGENCY,
    },
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const responses = baseResponses(rosterRows);
  responses.talent_profiles = { data: { is_publicly_hidden: true }, error: null };

  const supabase = fakeSupabase(responses);
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  assert.ok(result.globalHidden);
  for (const entry of result.entries) {
    assert.equal(entry.publicUrl, "", `${entry.kind}/${entry.slug} must not link while hidden`);
    assert.equal(entry.effective, "global_hidden");
  }
});

test("only memberships on this talent's roster are returned", async () => {
  // The query is `.eq("talent_profile_id", ...)`; the loader must not invent
  // entries from anywhere else. With one roster row there is exactly one
  // agency entry plus the talent's own self entry, and nothing more.
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: true,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: REAL_AGENCY,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  assert.deepEqual(
    result.entries.map((e) => `${e.kind}:${e.tenantId}`).sort(),
    ["agency:tenant-acme", "self_page:talent-1"].sort(),
  );
});

test("a roster row whose agency join came back empty produces no link", async () => {
  // No agency row means no slug and no tenant id, so there is no host to send
  // anyone to. Previously this built `tulala.digital/w//t/<code>`.
  const rosterRows = [
    {
      status: "active",
      created_at: "2026-02-01T00:00:00Z",
      is_primary: false,
      agency_visibility: "site_visible",
      talent_site_hidden: false,
      agencies: null,
    },
  ];

  const supabase = fakeSupabase(baseResponses(rosterRows));
  const result = await loadRepresentation("talent-1", "sofia-001", { client: supabase });

  const orphan = result.entries.find((e) => e.kind === "agency");
  assert.ok(orphan);
  assert.equal(orphan?.publicUrl, "");
});
