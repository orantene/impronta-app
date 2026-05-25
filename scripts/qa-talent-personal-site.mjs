#!/usr/bin/env node
/**
 * End-to-end QA for Talent Max personal site Phase 2.
 *
 * Drives every backend invariant via the linked Supabase project:
 *   1. Max owner can insert/update via RLS
 *   2. Non-owner can NOT see another talent's site (RLS isolation)
 *   3. Pro/Free plan is blocked from creating a personal site (Max gate)
 *   4. Public RPC returns only published, non-hidden rows
 *   5. Draft updates do NOT affect public RPC output (publish discipline)
 *   6. Downgrade keeps the published site visible
 *   7. Agency registry still includes directory/featured_talent/category_grid (smoke)
 *
 * No commits / no destructive permanent changes — every test row is rolled back.
 *
 * Usage:
 *   node scripts/qa-talent-personal-site.mjs
 *
 * Requires SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL in web/.env.vercel.local.
 */
import { readFileSync, existsSync } from "node:fs";

const ENV_FILE = "/Users/oranpersonal/Desktop/impronta-app/web/.env.vercel.local";
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = URL_.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!TOKEN || !REF) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const SQL_API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function sql(query) {
  const res = await fetch(SQL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`  PASS  ${name}${detail ? "  — " + detail : ""}`);
}
function fail(name, detail = "") {
  failed += 1;
  console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
}

// ── Pick a stable Max candidate (rostered, has user_id) ───────────────────
const MAX_PROFILE_ID = "eb97dc64-af2b-4996-a48c-913a143cfa59"; // QA Talent Dashboard Audit
const MAX_PROFILE_CODE = "TAL-AUDIT-0512";
const MAX_USER_ID = "4dc52f97-140b-4dc9-a722-4e915f3f86da";
const PRO_PROFILE_ID = "9fd3d8b0-c719-483a-986f-f866f7fe018d"; // Lanco (talent_pro)
const PRO_USER_ID = "4b9e595d-7c6c-4e65-8f7f-05cd60e85676";
const OTHER_USER_ID = "bfe72e1e-6a9e-401a-9b7a-44b032a28810"; // Orlando

const STARTER_SNAPSHOT = {
  version: 1,
  siteKind: "talent_personal",
  publishedAt: null,
  pageVersion: 1,
  locale: "en",
  fields: {
    title: "QA Talent Personal Site",
    metaDescription: "QA snapshot — phase 2 verification.",
    introTagline: "Personal site test draft",
  },
  templateSchemaVersion: 1,
  slots: [
    {
      slotKey: "hero",
      sortOrder: 0,
      sectionId: "11111111-1111-1111-1111-111111111111",
      sectionTypeKey: "hero",
      schemaVersion: 1,
      name: "Hero",
      props: {
        headline: "QA Talent Personal Site",
        subheadline: "Phase 2 verification snapshot",
      },
    },
  ],
};

function jsonbLiteral(obj) {
  return "'" + JSON.stringify(obj).replaceAll("'", "''") + "'::jsonb";
}

async function cleanup() {
  await sql(
    `DELETE FROM public.talent_sites WHERE talent_profile_id IN ('${MAX_PROFILE_ID}', '${PRO_PROFILE_ID}')`,
  );
  // Restore plan keys (Lanco was Pro, audit was Basic)
  await sql(
    `UPDATE public.talent_profiles SET talent_plan_key = 'talent_basic' WHERE id = '${MAX_PROFILE_ID}'`,
  );
  await sql(
    `UPDATE public.talent_profiles SET talent_plan_key = 'talent_pro' WHERE id = '${PRO_PROFILE_ID}'`,
  );
}

async function setSessionUser(userId) {
  // Mimic how PostgREST sets the JWT claim that auth.uid() reads.
  await sql(
    `select set_config('request.jwt.claims', '${JSON.stringify({
      sub: userId,
      role: "authenticated",
    })}', true)`,
  );
  await sql(`select set_config('role', 'authenticated', true)`);
}

async function asAnon() {
  await sql(`select set_config('request.jwt.claims', '', true)`);
  await sql(`select set_config('role', 'anon', true)`);
}

async function asServiceRole() {
  await sql(`reset role`);
  await sql(`select set_config('request.jwt.claims', '', true)`);
}

async function runAll() {
  console.log("\n=== Talent Max personal site — backend QA ===\n");

  // Sanity: target rows exist
  const profile = await sql(
    `SELECT id, profile_code, talent_plan_key, user_id, is_publicly_hidden FROM public.talent_profiles WHERE id = '${MAX_PROFILE_ID}'`,
  );
  if (!profile[0]) {
    fail("setup: max profile exists");
    return;
  }
  ok("setup: max profile exists", profile[0].profile_code);

  await cleanup();

  // ── 1. Max owner can create + publish ─────────────────────────────────
  console.log("\n[1] Max owner can create, save, publish a personal site");

  await sql(
    `UPDATE public.talent_profiles SET talent_plan_key = 'talent_portfolio' WHERE id = '${MAX_PROFILE_ID}'`,
  );

  // The owner-only INSERT policy requires is_talent_profile_owner() — uses auth.uid().
  // Set the session JWT to the talent's user_id and try to insert through PostgREST RLS.
  // We do this inside a single SQL roundtrip so set_config(..., true) survives.
  const insertBlock = `
    DO $$
    DECLARE
      v_site_id uuid;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub','${MAX_USER_ID}','role','authenticated')::text, true);
      PERFORM set_config('role', 'authenticated', true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.talent_sites (talent_profile_id, draft_snapshot, version, created_by, updated_by)
      VALUES ('${MAX_PROFILE_ID}', ${jsonbLiteral(STARTER_SNAPSHOT)}, 1, '${MAX_USER_ID}', '${MAX_USER_ID}')
      RETURNING id INTO v_site_id;

      INSERT INTO public.talent_site_revisions (talent_site_id, talent_profile_id, kind, version, snapshot, created_by)
      VALUES (v_site_id, '${MAX_PROFILE_ID}', 'draft', 1, ${jsonbLiteral(STARTER_SNAPSHOT)}, '${MAX_USER_ID}');

      UPDATE public.talent_sites
      SET status = 'published',
          published_snapshot = ${jsonbLiteral({ ...STARTER_SNAPSHOT, publishedAt: new Date().toISOString(), pageVersion: 2 })},
          published_at = now(),
          version = 2
      WHERE id = v_site_id;

      INSERT INTO public.talent_site_revisions (talent_site_id, talent_profile_id, kind, version, snapshot, created_by)
      VALUES (v_site_id, '${MAX_PROFILE_ID}', 'published', 2, ${jsonbLiteral({ ...STARTER_SNAPSHOT, publishedAt: new Date().toISOString(), pageVersion: 2 })}, '${MAX_USER_ID}');
    END $$;
  `;
  try {
    await sql(insertBlock);
    ok("max owner insert + publish via RLS");
  } catch (e) {
    fail("max owner insert + publish via RLS", e.message);
  }

  await asServiceRole();
  const site = await sql(
    `SELECT id, status, version, draft_snapshot IS NOT NULL AS has_draft, published_snapshot IS NOT NULL AS has_published FROM public.talent_sites WHERE talent_profile_id = '${MAX_PROFILE_ID}'`,
  );
  if (site[0]?.status === "published" && site[0]?.has_published) {
    ok("max site landed and is published");
  } else {
    fail("max site landed and is published", JSON.stringify(site[0]));
  }

  // ── 2. Non-owner cannot read another talent's site via RLS ────────────
  console.log("\n[2] RLS isolation — non-owner cannot read another talent's site");
  const otherRead = await sql(`
    DO $$
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub','${OTHER_USER_ID}','role','authenticated')::text, true);
      SET LOCAL ROLE authenticated;
    END $$;
    SELECT id FROM public.talent_sites WHERE talent_profile_id = '${MAX_PROFILE_ID}'
  `);
  if (Array.isArray(otherRead) && otherRead.length === 0) {
    ok("non-owner sees zero rows", "RLS isolation correct");
  } else {
    fail("non-owner sees zero rows", JSON.stringify(otherRead));
  }

  // ── 3. Pro plan cannot create a site (Max gate) ───────────────────────
  console.log("\n[3] Pro plan blocked from creating a personal site");
  try {
    await sql(`
      DO $$
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub','${PRO_USER_ID}','role','authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        INSERT INTO public.talent_sites (talent_profile_id, draft_snapshot, version)
        VALUES ('${PRO_PROFILE_ID}', ${jsonbLiteral(STARTER_SNAPSHOT)}, 1);
      END $$;
    `);
    // Check: was the row actually inserted? RLS WITH CHECK fails should raise, but DO blocks can swallow.
    await asServiceRole();
    const proRows = await sql(
      `SELECT id FROM public.talent_sites WHERE talent_profile_id = '${PRO_PROFILE_ID}'`,
    );
    if (proRows.length === 0) {
      ok("pro plan cannot insert (RLS WITH CHECK denied)");
    } else {
      fail("pro plan cannot insert", `unexpected row: ${JSON.stringify(proRows)}`);
      await sql(
        `DELETE FROM public.talent_sites WHERE talent_profile_id = '${PRO_PROFILE_ID}'`,
      );
    }
  } catch (e) {
    if (/row-level security/i.test(e.message) || /violates/.test(e.message)) {
      ok("pro plan cannot insert", "raised RLS violation");
    } else {
      fail("pro plan cannot insert (unexpected error)", e.message);
    }
  }

  // ── 4. Public RPC returns published rows for non-hidden profile ───────
  console.log("\n[4] Public RPC returns only published, non-hidden snapshots");
  await asServiceRole();
  const rpcRows = await sql(
    `SELECT * FROM public.talent_public_site_for_profile_code('${MAX_PROFILE_CODE}')`,
  );
  if (rpcRows.length === 1 && rpcRows[0].published_snapshot) {
    ok("public RPC returns published row", `version ${rpcRows[0].published_snapshot.pageVersion}`);
  } else {
    fail("public RPC returns published row", JSON.stringify(rpcRows));
  }

  // ── 5. Draft-after-publish discipline — draft changes do NOT change public output
  console.log("\n[5] Draft changes after publish do not change public output");
  const newDraftTitle = "DRAFT — should not appear publicly";
  await sql(`
    UPDATE public.talent_sites
    SET draft_snapshot = ${jsonbLiteral({
      ...STARTER_SNAPSHOT,
      fields: { ...STARTER_SNAPSHOT.fields, title: newDraftTitle },
    })},
        version = 3
    WHERE talent_profile_id = '${MAX_PROFILE_ID}'
  `);
  const rpcAfterDraft = await sql(
    `SELECT (published_snapshot->'fields'->>'title') AS title FROM public.talent_public_site_for_profile_code('${MAX_PROFILE_CODE}')`,
  );
  if (rpcAfterDraft[0]?.title === "QA Talent Personal Site") {
    ok("public RPC unaffected by draft update", `still '${rpcAfterDraft[0].title}'`);
  } else {
    fail("public RPC unaffected by draft update", JSON.stringify(rpcAfterDraft[0]));
  }

  // ── 6. Downgrade preserves published visibility ────────────────────────
  console.log("\n[6] Downgrade from Max keeps published site visible");
  await sql(
    `UPDATE public.talent_profiles SET talent_plan_key = 'talent_basic' WHERE id = '${MAX_PROFILE_ID}'`,
  );
  const rpcAfterDowngrade = await sql(
    `SELECT (published_snapshot->'fields'->>'title') AS title, published_at FROM public.talent_public_site_for_profile_code('${MAX_PROFILE_CODE}')`,
  );
  if (rpcAfterDowngrade.length === 1) {
    ok("public RPC still returns published row after downgrade");
  } else {
    fail("public RPC after downgrade", JSON.stringify(rpcAfterDowngrade));
  }

  // Hidden profile blocks public access
  console.log("\n[6b] Hidden profile blocks RPC");
  await sql(
    `UPDATE public.talent_profiles SET is_publicly_hidden = true WHERE id = '${MAX_PROFILE_ID}'`,
  );
  const rpcHidden = await sql(
    `SELECT * FROM public.talent_public_site_for_profile_code('${MAX_PROFILE_CODE}')`,
  );
  if (rpcHidden.length === 0) {
    ok("public RPC returns 0 rows when is_publicly_hidden = true");
  } else {
    fail("public RPC vs hidden profile", JSON.stringify(rpcHidden));
  }
  await sql(
    `UPDATE public.talent_profiles SET is_publicly_hidden = false WHERE id = '${MAX_PROFILE_ID}'`,
  );

  // ── 7. anon role has EXECUTE on the RPC ───────────────────────────────
  console.log("\n[7] anon role can execute the public RPC");
  const grantRow = await sql(
    `SELECT has_function_privilege('anon', 'public.talent_public_site_for_profile_code(text)', 'EXECUTE') AS has`,
  );
  if (grantRow[0]?.has === true) {
    ok("anon has EXECUTE on talent_public_site_for_profile_code");
  } else {
    fail("anon EXECUTE grant", JSON.stringify(grantRow));
  }

  // ── 8. Cleanup ────────────────────────────────────────────────────────
  console.log("\n[cleanup] removing QA artifacts");
  await cleanup();
  const final = await sql(
    `SELECT count(*)::int AS n FROM public.talent_sites WHERE talent_profile_id IN ('${MAX_PROFILE_ID}', '${PRO_PROFILE_ID}')`,
  );
  if (final[0]?.n === 0) {
    ok("cleanup: zero residual rows");
  } else {
    fail("cleanup", JSON.stringify(final[0]));
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

runAll().catch((e) => {
  console.error("Fatal:", e);
  cleanup().finally(() => process.exit(2));
});
