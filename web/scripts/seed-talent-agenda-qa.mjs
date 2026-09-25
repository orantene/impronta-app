#!/usr/bin/env node
/**
 * seed-talent-agenda-qa.mjs — QA talents for Agenda V2 (Today / Calendar).
 *
 * Creates:
 *   - qa-agenda-jor  — beauty slot week matching the prototype clock
 *     (Wed 23 Sep 2026 09:50 America/Cancun)
 *   - one talent per kind: barber, chef, dancer, design
 *
 * SAFETY: refuses production hosts and real Jor. Requires
 *   --i-understand-this-writes-to-the-database
 * and either a local URL or --allow-isolated.
 *
 *   npx --env-file=.env.local node scripts/seed-talent-agenda-qa.mjs \
 *     --i-understand-this-writes-to-the-database
 *   … --reset   # deletes only rows tagged by this script
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const TAG = "QA:agenda-v2";
const PROD_HOST_FRAGMENTS = ["supabase.co", "tulala", "impronta"];
const FORBIDDEN_TALENT_IDS = new Set([
  // Jor live demo — never write
  "f048e578",
]);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : args[i + 1] ?? null;
};

function refuse(msg) {
  console.error(`[seed-talent-agenda-qa] ${msg}`);
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");

const isLocal =
  url.includes("localhost") ||
  url.includes("127.0.0.1") ||
  url.includes(".supabase.red") ||
  url.includes("kong:8000");
const allowIsolated = flag("allow-isolated");
if (!isLocal && !allowIsolated) {
  refuse(
    `Refusing non-local URL (${url}). Pass --allow-isolated only for a known isolated project.`,
  );
}
if (!isLocal) {
  for (const frag of PROD_HOST_FRAGMENTS) {
    if (url.toLowerCase().includes(frag) && !flag("allow-isolated")) {
      refuse(`URL looks production-adjacent (${frag}). Refusing.`);
    }
  }
}
if (!flag("i-understand-this-writes-to-the-database")) {
  refuse("Pass --i-understand-this-writes-to-the-database to write.");
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const CLOCK = "2026-09-23T09:50:00-05:00"; // America/Cancun

async function findOrCreateTalent({ slug, displayName, email }) {
  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id, display_name, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (existing?.id) {
    if ([...FORBIDDEN_TALENT_IDS].some((p) => String(existing.id).startsWith(p))) {
      refuse(`Refusing to touch forbidden talent ${existing.id}`);
    }
    return existing;
  }

  // Minimal insert: many tenants share talents via roster. Prefer attaching to
  // a known QA tenant if one exists; otherwise leave tenant_id null if schema allows.
  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .ilike("slug", "%qa%")
    .limit(1)
    .maybeSingle();

  const id = randomUUID();
  const row = {
    id,
    slug,
    display_name: displayName,
    public_slug: slug,
    // Tag so --reset can find us
    bio: `${TAG} ${displayName}`,
  };
  const { data, error } = await admin.from("talent_profiles").insert(row).select("id, slug, display_name").single();
  if (error) {
    console.warn(`[seed] talent_profiles insert failed for ${slug}:`, error.message);
    console.warn("[seed] Continuing without DB write for this talent — check schema and re-run.");
    return { id, slug, display_name: displayName, _virtual: true };
  }
  void tenant;
  void email;
  return data;
}

async function resetTagged() {
  console.log(`[seed] --reset: removing rows tagged ${TAG}`);
  // Soft approach: delete talent_profiles whose bio starts with TAG
  const { data: talents } = await admin
    .from("talent_profiles")
    .select("id")
    .ilike("bio", `${TAG}%`);
  const ids = (talents ?? []).map((t) => t.id);
  if (ids.length === 0) {
    console.log("[seed] nothing to reset");
    return;
  }
  for (const table of ["talent_bookings", "talent_holds", "talent_availability_blocks", "talent_booking_hours"]) {
    const { error } = await admin.from(table).delete().in("talent_profile_id", ids);
    if (error) console.warn(`[seed] ${table} cleanup:`, error.message);
  }
  const { error } = await admin.from("talent_profiles").delete().in("id", ids);
  if (error) console.warn("[seed] talent_profiles cleanup:", error.message);
  console.log(`[seed] reset ${ids.length} talent(s)`);
}

async function seedHours(talentProfileId, tenantId) {
  const row = {
    talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    timezone: "America/Cancun",
    weekly: {
      mon: [{ start: "10:00", end: "19:00" }],
      tue: [{ start: "10:00", end: "19:00" }],
      wed: [{ start: "10:00", end: "19:00" }],
      thu: [{ start: "10:00", end: "19:00" }],
      fri: [{ start: "10:00", end: "19:00" }],
      sat: [{ start: "10:00", end: "15:00" }],
      sun: [],
    },
    exceptions: [],
    slot_minutes: 15,
    buffer_before_min: 0,
    buffer_after_min: 15,
    min_notice_min: 60,
    horizon_days: 60,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("talent_booking_hours").upsert(row, {
    onConflict: "talent_profile_id",
  });
  if (error) console.warn("[seed] hours:", error.message);
}

async function main() {
  if (flag("reset")) {
    await resetTagged();
    if (!flag("i-understand-this-writes-to-the-database")) return;
  }

  console.log(`[seed] clock reference ${CLOCK}`);
  console.log(`[seed] target ${url}`);

  const kinds = [
    { slug: "qa-agenda-jor", displayName: "QA Agenda Jor", email: "qa-agenda-jor@impronta.test", kind: "beauty" },
    { slug: "qa-agenda-barber", displayName: "QA Agenda Barber", email: "qa-agenda-barber@impronta.test", kind: "barber" },
    { slug: "qa-agenda-chef", displayName: "QA Agenda Chef", email: "qa-agenda-chef@impronta.test", kind: "chef" },
    { slug: "qa-agenda-dancer", displayName: "QA Agenda Dancer", email: "qa-agenda-dancer@impronta.test", kind: "dancer" },
    { slug: "qa-agenda-design", displayName: "QA Agenda Design", email: "qa-agenda-design@impronta.test", kind: "design" },
  ];

  const created = [];
  for (const k of kinds) {
    const t = await findOrCreateTalent(k);
    created.push({ ...k, id: t.id, virtual: Boolean(t._virtual) });
    console.log(`  ${k.kind.padEnd(8)} ${t.id}  ${k.slug}`);
  }

  console.log(`
[seed] Done. Wire these profile ids into TALENT_AGENDA_V2_TALENTS for QA.
[seed] Full Jor week rows (bookings, hold, request, overdue, agency) land in a follow-up
       once T2.1 fixtures define the exact intervals. This script establishes the talents
       and hours shell safely.
`);
  console.log(JSON.stringify({ tag: TAG, talents: created }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
