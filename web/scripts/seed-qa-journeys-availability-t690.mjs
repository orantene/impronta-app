#!/usr/bin/env node
/**
 * TUL-690 staging fixture. STAGING ONLY (qa-journeys, tenant 3333...3333).
 *
 *   node --env-file=<staging env file> scripts/seed-qa-journeys-availability-t690.mjs --dry-run
 *   node --env-file=<staging env file> scripts/seed-qa-journeys-availability-t690.mjs
 *   node --env-file=<staging env file> scripts/seed-qa-journeys-availability-t690.mjs --rollback
 *
 * Changes (idempotent):
 *   a) talent_booking_hours: one rules row per talent that owns a service of the
 *      workspace, open every day 09:00-18:00 (weekly RULES, not slots; slots are
 *      computed), min_notice 60, horizon >= 30 days (covers the next 14).
 *   b) talent_offerings: ONE service (first by sort_order, created_at, id) made
 *      prepaid: reserve_mode full, booking_mode instant, 500 MXN, exact price,
 *      pay-in-person off.
 *   c) auth user tulalaqa+paidguest690@mail.grokbot.com (email_confirmed, NO
 *      password) plus a public.profiles client row if the signup trigger did
 *      not create one.
 *
 * --rollback restores the saved previous values (hours rows, the offering) from
 * the state file in os.tmpdir() (web/scripts/.seed-state is not gitignored). It
 * does not delete the auth user (that is a human call).
 * Never prints keys.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  checkStagingOnly,
  everyDayWeekly,
  QA_JOURNEYS_TENANT_ID,
} from "./lib/staging-only-guard.mjs";

const DRY = process.argv.includes("--dry-run");
const ROLLBACK = process.argv.includes("--rollback");
const GUEST_EMAIL = "tulalaqa+paidguest690@mail.grokbot.com";
const PRICE_CENTS = 50000;
const PRICE_CURRENCY = "MXN";
const STATE_DIR = join(tmpdir(), "tulala-seed-state");
const STATE_FILE = join(STATE_DIR, "seed-qa-journeys-availability-t690.json");
const log = (...a) => console.log(DRY ? "[t690 dry-run]" : "[t690]", ...a);

const guard = checkStagingOnly(process.env);
if (!guard.ok) {
  console.error(`[t690] REFUSING: ${guard.reason}`);
  process.exit(2);
}
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!key) {
  console.error("[t690] SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(2);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

const HOURS_COLS = "talent_profile_id, tenant_id, timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days";
const OFFERING_COLS = "id, reserve_mode, deposit_pct, booking_mode, amount_cents, currency, price_display, price_type, allow_pay_in_person";

function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
}
function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function rollback() {
  const st = loadState();
  if (!st) {
    log("no saved state; nothing to roll back.");
    return;
  }
  for (const h of st.hours) {
    if (h.before === null) {
      log(`hours ${h.talentProfileId}: delete row created by seed`);
      if (!DRY) must("delete hours", await admin.from("talent_booking_hours").delete().eq("talent_profile_id", h.talentProfileId).eq("tenant_id", QA_JOURNEYS_TENANT_ID));
    } else {
      log(`hours ${h.talentProfileId}: restore previous row`);
      if (!DRY) must("restore hours", await admin.from("talent_booking_hours").upsert(h.before, { onConflict: "talent_profile_id" }));
    }
  }
  if (st.offering) {
    const { id, ...prev } = st.offering.before;
    log(`offering ${id}: restore previous payment fields`);
    if (!DRY) must("restore offering", await admin.from("talent_offerings").update(prev).eq("id", id).eq("tenant_id", QA_JOURNEYS_TENANT_ID));
  }
  log("auth user left in place (delete by hand if wanted).");
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function apply() {
  const offerings = must(
    "read offerings",
    await admin.from("talent_offerings").select(`${OFFERING_COLS}, talent_profile_id, title, status, sort_order, created_at`)
      .eq("tenant_id", QA_JOURNEYS_TENANT_ID).eq("kind", "service")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true }).order("id", { ascending: true }),
  );
  log(`workspace services found: ${offerings.length} (${offerings.map((o) => o.title).join(" | ")})`);
  if (offerings.length === 0) throw new Error("no services in the qa-journeys workspace; aborting.");

  // Keep the first run's saved "before" values so a re-run never overwrites them.
  const prior = loadState();
  const state = prior ?? { savedAt: new Date().toISOString(), hours: [], offering: null };

  // a) hours rules, one per owning talent
  const talentIds = [...new Set(offerings.map((o) => o.talent_profile_id).filter(Boolean))]; // workspace-owned services have no talent owner
  for (const tid of talentIds) {
    const before = must("read hours", await admin.from("talent_booking_hours").select(HOURS_COLS).eq("talent_profile_id", tid).maybeSingle());
    if (!state.hours.some((h) => h.talentProfileId === tid)) state.hours.push({ talentProfileId: tid, before: before ?? null });
    const next = {
      talent_profile_id: tid,
      tenant_id: QA_JOURNEYS_TENANT_ID,
      timezone: before?.timezone && before.timezone !== "UTC" ? before.timezone : "America/Cancun",
      weekly: everyDayWeekly(),
      exceptions: before?.exceptions ?? [],
      slot_minutes: before?.slot_minutes ?? 30,
      buffer_before_min: before?.buffer_before_min ?? 0,
      buffer_after_min: before?.buffer_after_min ?? 0,
      min_notice_min: 60,
      horizon_days: Math.max(before?.horizon_days ?? 0, 30),
      updated_at: new Date().toISOString(),
    };
    log(`hours ${tid}: ${before ? "update" : "create"} -> open every day 09:00-18:00 ${next.timezone}, horizon ${next.horizon_days}d`);
    if (!DRY) must("upsert hours", await admin.from("talent_booking_hours").upsert(next, { onConflict: "talent_profile_id" }));
  }

  // b) one prepaid service
  // Prefer the dedicated QA paid service so QA sees a clearly named prepaid card.
  const target = offerings.find((o) => /^QA paid/i.test(o.title ?? "")) ?? offerings[0];
  if (!state.offering) {
    const { talent_profile_id: _t, title: _ti, status: _s, sort_order: _so, created_at: _c, ...before } = target;
    state.offering = { before };
  }
  const patch = {
    reserve_mode: "full",
    deposit_pct: null,
    booking_mode: "instant",
    amount_cents: PRICE_CENTS,
    currency: PRICE_CURRENCY,
    price_display: "exact",
    price_type: "flat_package",
    allow_pay_in_person: false,
  };
  log(`offering "${target.title}" (${target.id}): prepaid, ${PRICE_CENTS / 100} ${PRICE_CURRENCY}, reserve_mode full, instant`);
  if (!DRY) must("update offering", await admin.from("talent_offerings").update(patch).eq("id", target.id).eq("tenant_id", QA_JOURNEYS_TENANT_ID));

  if (!DRY) saveState(state);
  log(DRY ? "state would be saved to (not written)" : "state saved to", STATE_FILE);

  // c) guest auth user, no password
  let user = await findUserByEmail(GUEST_EMAIL);
  if (user) {
    log(`auth user ${GUEST_EMAIL} already exists (${user.id}); unchanged.`);
  } else {
    log(`auth user ${GUEST_EMAIL}: create (email confirmed, no password)`);
    if (!DRY) {
      const { data, error } = await admin.auth.admin.createUser({ email: GUEST_EMAIL, email_confirm: true });
      if (error) throw new Error(`createUser: ${error.message}`);
      user = data.user;
    }
  }
  if (user) {
    const prof = must("read profile", await admin.from("profiles").select("id, app_role").eq("id", user.id).maybeSingle());
    if (prof) {
      log(`profiles row exists (app_role ${prof.app_role}); unchanged.`);
    } else {
      log("profiles row missing: insert as client");
      if (!DRY) must("insert profile", await admin.from("profiles").insert({ id: user.id, display_name: "QA Paid Guest 690", app_role: "client", account_status: "active" }));
    }
  }
}

try {
  if (ROLLBACK) await rollback();
  else await apply();
  log("done.");
} catch (err) {
  console.error("[t690] FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
