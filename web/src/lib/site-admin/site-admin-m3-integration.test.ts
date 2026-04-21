/**
 * Phase 5 / M3 — integration tests.
 *
 * Two tiers:
 *
 *   1. PREVIEW JWT subject binding — pure crypto, always runs.
 *      Sets a short-lived PREVIEW_JWT_SECRET at the top of the test so
 *      signPreviewJwt/verifyPreviewJwt can be exercised without any
 *      environment bootstrap.
 *
 *   2. DATABASE lifecycle + uniqueness + triggers — real Supabase, env-gated.
 *      Runs only when the operator supplies:
 *        - NEXT_PUBLIC_SUPABASE_URL
 *        - SUPABASE_SERVICE_ROLE_KEY
 *        - TEST_M3_TENANT_ID        (primary tenant UUID — must exist)
 *        - TEST_M3_TENANT_ID_2      (OPTIONAL — enables cross-tenant slug test)
 *
 *      The service-role client is used to bypass RLS so the test exercises
 *      DB-level invariants directly (unique index, system-ownership trigger,
 *      reserved-slug trigger, `cms_public_pages_for_tenant` RPC filtering).
 *      Application-layer capability checks are proven separately by the
 *      unit-level role matrix in `site-admin-m3.test.ts`.
 *
 *      Every page row inserted by this test uses a slug prefixed with
 *      `m3-itest-` and a stable disposable UUID namespace. Fixtures are
 *      removed in `t.after(...)` and best-effort in `before` so prior
 *      aborted runs don't pollute the tenant.
 *
 * Run: npx tsx --test src/lib/site-admin/site-admin-m3-integration.test.ts
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { signPreviewJwt, verifyPreviewJwt } from "./preview/jwt";

// ---------------------------------------------------------------------------
// Preview JWT subject binding (always runs)
// ---------------------------------------------------------------------------

// Ensure a local secret for the crypto-only tests — does not escape this file.
process.env.PREVIEW_JWT_SECRET ??= "m3-integration-secret-padding-".padEnd(48, "x");

describe("preview JWT subject binding", () => {
  test("token carries subject page:<id> exactly", () => {
    const pageA = randomUUID();
    const { token } = signPreviewJwt({
      tenantId: randomUUID(),
      actorProfileId: randomUUID(),
      subject: `page:${pageA}`,
    });

    const result = verifyPreviewJwt(token);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.claims.subject, `page:${pageA}`);
      assert.notEqual(result.claims.subject, `page:${randomUUID()}`);
    }
  });

  test("tampered signature is rejected", () => {
    const { token } = signPreviewJwt({
      tenantId: randomUUID(),
      actorProfileId: randomUUID(),
      subject: `page:${randomUUID()}`,
    });
    const parts = token.split(".");
    const flippedSig =
      parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
    const tampered = `${parts[0]}.${parts[1]}.${flippedSig}`;

    const result = verifyPreviewJwt(tampered);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "bad_signature");
  });

  test("malformed token is rejected", () => {
    const result = verifyPreviewJwt("not.a.token.at.all");
    assert.equal(result.ok, false);
  });

  test("tenantId round-trips through claims", () => {
    const tenantId = randomUUID();
    const { token } = signPreviewJwt({
      tenantId,
      actorProfileId: randomUUID(),
      subject: `page:${randomUUID()}`,
    });
    const result = verifyPreviewJwt(token);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.claims.tenantId, tenantId);
  });
});

// ---------------------------------------------------------------------------
// DB lifecycle + uniqueness + triggers (env-gated)
// ---------------------------------------------------------------------------

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TENANT_A = process.env.TEST_M3_TENANT_ID?.trim();
const TENANT_B = process.env.TEST_M3_TENANT_ID_2?.trim();

const DB_READY = Boolean(SUPA_URL && SERVICE_KEY && TENANT_A);
const DB_SKIP_REASON = DB_READY
  ? undefined
  : "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TEST_M3_TENANT_ID to run DB integration tests";

const SLUG_PREFIX = "m3-itest";

function slugFor(label: string): string {
  return `${SLUG_PREFIX}-${label}-${randomUUID().slice(0, 8)}`;
}

function draftInsert(tenantId: string, slug: string, locale: "en" | "es" = "en") {
  return {
    tenant_id: tenantId,
    locale,
    slug,
    template_key: "standard_page",
    template_schema_version: 1,
    title: `M3 integration ${slug}`,
    body: "",
    hero: {},
    noindex: false,
    include_in_sitemap: true,
    status: "draft" as const,
    version: 1,
  };
}

async function cleanupTenant(supabase: SupabaseClient, tenantId: string) {
  // Revisions cascade on page delete; pages we delete explicitly.
  await supabase
    .from("cms_pages")
    .delete()
    .eq("tenant_id", tenantId)
    .ilike("slug", `${SLUG_PREFIX}-%`);
}

describe("cms_pages DB invariants (env-gated)", { skip: DB_SKIP_REASON }, () => {
  const supabase = createClient(SUPA_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  before(async () => {
    // Best-effort pre-clean in case a prior run aborted.
    await cleanupTenant(supabase, TENANT_A!);
    if (TENANT_B) await cleanupTenant(supabase, TENANT_B);
  });

  after(async () => {
    await cleanupTenant(supabase, TENANT_A!);
    if (TENANT_B) await cleanupTenant(supabase, TENANT_B);
  });

  test("lifecycle: insert draft → publish → RPC sees it → archive → RPC hides it", async () => {
    const slug = slugFor("lifecycle");
    const { data: inserted, error: insErr } = await supabase
      .from("cms_pages")
      .insert(draftInsert(TENANT_A!, slug))
      .select("id, version")
      .single();
    assert.equal(insErr, null);
    assert.ok(inserted);

    // Draft must NOT appear in public RPC.
    {
      const { data: pubDraft, error } = await supabase.rpc(
        "cms_public_pages_for_tenant",
        { p_tenant_id: TENANT_A! },
      );
      assert.equal(error, null);
      const match = (pubDraft ?? []).find((r: { id: string }) => r.id === inserted!.id);
      assert.equal(match, undefined, "draft must not appear in public reader");
    }

    // Publish.
    const { error: pubErr } = await supabase
      .from("cms_pages")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        version: inserted!.version + 1,
      })
      .eq("id", inserted!.id);
    assert.equal(pubErr, null);

    {
      const { data: pubLive, error } = await supabase.rpc(
        "cms_public_pages_for_tenant",
        { p_tenant_id: TENANT_A! },
      );
      assert.equal(error, null);
      const match = (pubLive ?? []).find(
        (r: { id: string }) => r.id === inserted!.id,
      );
      assert.ok(match, "published page must appear in public reader");
      assert.equal((match as { status: string }).status, "published");
    }

    // Archive.
    const { error: arcErr } = await supabase
      .from("cms_pages")
      .update({ status: "archived", version: inserted!.version + 2 })
      .eq("id", inserted!.id);
    assert.equal(arcErr, null);

    {
      const { data: pubArc } = await supabase.rpc("cms_public_pages_for_tenant", {
        p_tenant_id: TENANT_A!,
      });
      const match = (pubArc ?? []).find((r: { id: string }) => r.id === inserted!.id);
      assert.equal(
        match,
        undefined,
        "archived page must not appear in public reader",
      );
    }
  });

  test("unique (tenant_id, locale, slug) — same trio rejected", async () => {
    const slug = slugFor("dup");
    const { error: firstErr } = await supabase
      .from("cms_pages")
      .insert(draftInsert(TENANT_A!, slug));
    assert.equal(firstErr, null);

    const { error: dupErr } = await supabase
      .from("cms_pages")
      .insert(draftInsert(TENANT_A!, slug));
    assert.notEqual(dupErr, null, "duplicate (tenant, locale, slug) must fail");
    assert.match(dupErr!.message, /duplicate|unique|cms_pages_tenant_locale_slug/i);
  });

  test("same slug + different locale on same tenant → allowed", async () => {
    const slug = slugFor("bilingual");
    const { error: enErr } = await supabase
      .from("cms_pages")
      .insert(draftInsert(TENANT_A!, slug, "en"));
    assert.equal(enErr, null);

    const { error: esErr } = await supabase
      .from("cms_pages")
      .insert(draftInsert(TENANT_A!, slug, "es"));
    assert.equal(esErr, null, "same slug in different locales must be allowed");
  });

  test(
    "same slug + same locale + different tenant → allowed",
    { skip: TENANT_B ? undefined : "Set TEST_M3_TENANT_ID_2 to enable cross-tenant slug test" },
    async () => {
      const slug = slugFor("crosstenant");
      const { error: aErr } = await supabase
        .from("cms_pages")
        .insert(draftInsert(TENANT_A!, slug));
      assert.equal(aErr, null);

      const { error: bErr } = await supabase
        .from("cms_pages")
        .insert(draftInsert(TENANT_B!, slug));
      assert.equal(
        bErr,
        null,
        "each tenant should own its own slug namespace per locale",
      );
    },
  );

  test("reserved slug blocked by DB trigger", async () => {
    const { error } = await supabase.from("cms_pages").insert({
      ...draftInsert(TENANT_A!, "admin"),
      slug: "admin",
    });
    assert.notEqual(error, null, "reserved slug `admin` must be blocked");
    assert.match(error!.message, /RESERVED_SLUG|reserved/i);
  });

  test("system-owned page cannot be deleted (probe existing row)", async () => {
    // Probe: the M0 foundation migration (and M3 homepage seeding) should
    // have created at least one is_system_owned=TRUE row for this tenant.
    // We verify the DB trigger blocks DELETE on it. If no such row exists
    // on the test tenant (fresh tenant with no homepage seeded yet), the
    // assertion is skipped — the trigger itself is already covered by the
    // migration's own regression test on the platform side.
    const { data: systemRow, error: probeErr } = await supabase
      .from("cms_pages")
      .select("id, title")
      .eq("tenant_id", TENANT_A!)
      .eq("is_system_owned", true)
      .limit(1)
      .maybeSingle<{ id: string; title: string }>();
    assert.equal(probeErr, null);

    if (!systemRow) {
      // Fresh tenant with no seeded homepage — trigger is tested elsewhere.
      return;
    }

    const { error: delErr } = await supabase
      .from("cms_pages")
      .delete()
      .eq("id", systemRow.id);
    assert.notEqual(delErr, null, "system-owned page delete must be blocked");
    assert.match(delErr!.message, /SYSTEM_PAGE_IMMUTABLE|system/i);

    // Also verify that mutating slug / locale / template_key is blocked.
    const { error: mutErr } = await supabase
      .from("cms_pages")
      .update({ slug: `${SLUG_PREFIX}-mutated-slug` })
      .eq("id", systemRow.id);
    assert.notEqual(
      mutErr,
      null,
      "system-owned page slug mutation must be blocked",
    );
    assert.match(mutErr!.message, /SYSTEM_PAGE_IMMUTABLE|system/i);
  });
});
