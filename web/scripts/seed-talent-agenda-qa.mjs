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
 *   node --env-file=.env.local scripts/seed-talent-agenda-qa.mjs \
 *     --i-understand-this-writes-to-the-database
 *   … --allow-isolated   # required for remote isolated Supabase
 *   … --reset            # deletes only rows tagged by this script
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

async function resolveQaAgencyId() {
  const { data } = await admin
    .from("agencies")
    .select("id")
    .ilike("slug", "%qa%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function findOrCreateTalent({ slug, displayName, email, userId }) {
  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id, display_name, public_slug_part, profile_code")
    .eq("public_slug_part", slug)
    .maybeSingle();
  if (existing?.id) {
    if ([...FORBIDDEN_TALENT_IDS].some((p) => String(existing.id).startsWith(p))) {
      refuse(`Refusing to touch forbidden talent ${existing.id}`);
    }
    if (userId && existing.id) {
      const { error: linkErr } = await admin
        .from("talent_profiles")
        .update({ user_id: userId, is_test_account: true, short_bio: `${TAG} ${displayName}` })
        .eq("id", existing.id)
        .is("user_id", null);
      if (linkErr) console.warn(`[seed] link user_id for ${slug}:`, linkErr.message);
    }
    return existing;
  }

  const { data: profileCode, error: codeError } = await admin.rpc("generate_profile_code");
  if (codeError || !profileCode) {
    console.warn(`[seed] generate_profile_code failed for ${slug}:`, codeError?.message);
  }

  const id = randomUUID();
  if ([...FORBIDDEN_TALENT_IDS].some((p) => id.startsWith(p))) {
    refuse(`Refusing generated id that collides with forbidden prefix`);
  }

  const row = {
    id,
    profile_code: typeof profileCode === "string" ? profileCode : `TAL-QAAGENDA-${slug.slice(-8).toUpperCase()}`,
    public_slug_part: slug,
    display_name: displayName,
    invitation_email: email,
    short_bio: `${TAG} ${displayName}`,
    is_test_account: true,
    workflow_status: "draft",
    visibility: "hidden",
    is_publicly_listed: false,
    is_discoverable: false,
    ...(userId ? { user_id: userId } : {}),
  };
  const { data, error } = await admin
    .from("talent_profiles")
    .insert(row)
    .select("id, public_slug_part, display_name, profile_code")
    .single();
  if (error) {
    console.warn(`[seed] talent_profiles insert failed for ${slug}:`, error.message);
    console.warn("[seed] Continuing without DB write for this talent — check schema and re-run.");
    return { id, public_slug_part: slug, display_name: displayName, _virtual: true };
  }
  return data;
}

async function resetTagged() {
  console.log(`[seed] --reset: removing rows tagged ${TAG}`);
  const { data: talents } = await admin
    .from("talent_profiles")
    .select("id")
    .ilike("short_bio", `${TAG}%`);
  const ids = (talents ?? []).map((t) => t.id);
  if (ids.length === 0) {
    console.log("[seed] nothing to reset");
    return;
  }
  for (const table of ["talent_bookings", "talent_holds", "talent_availability_blocks", "talent_booking_hours"]) {
    const { error } = await admin.from(table).delete().in("talent_profile_id", ids);
    if (error) console.warn(`[seed] ${table} cleanup:`, error.message);
  }
  // Commercial rows share ids with talent_bookings for agenda fixtures.
  const { data: taggedBookings } = await admin
    .from("agency_bookings")
    .select("id")
    .ilike("title", `${TAG}%`);
  const bookingIds = (taggedBookings ?? []).map((r) => r.id);
  if (bookingIds.length) {
    await admin.from("booking_deliverables").delete().in("booking_id", bookingIds);
    await admin.from("booking_talent").delete().in("booking_id", bookingIds);
    await admin.from("agency_bookings").delete().in("id", bookingIds);
  }
  const { error } = await admin.from("talent_profiles").delete().in("id", ids);
  if (error) console.warn("[seed] talent_profiles cleanup:", error.message);
  console.log(`[seed] reset ${ids.length} talent(s)`);
}

async function seedHours(talentProfileId, tenantId) {
  if (!tenantId) {
    console.warn(`[seed] hours skipped for ${talentProfileId}: no QA agency tenant_id`);
    return;
  }
  // Match BookingHours weekly shape: weekday keys 0-6 (Sun-Sat), startMin/endMin.
  const day = (startH, endH) => [{ startMin: startH * 60, endMin: endH * 60 }];
  const row = {
    talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    timezone: "America/Cancun",
    weekly: {
      0: [],
      1: day(10, 19),
      2: day(10, 19),
      3: day(10, 19),
      4: day(10, 19),
      5: day(10, 19),
      6: day(10, 15),
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

/**
 * W1.2 — week rows for primary beauty talent around CLOCK.
 * Mirrors jor-week fixture intervals; tagged via title prefix for --reset.
 */
async function seedWeekFixtures(talentProfileId, tenantId, createdByUserId) {
  if (!tenantId) {
    console.warn("[seed] week fixtures skipped: no tenant");
    return;
  }

  // Clear prior QA calendar rows for this talent (safe — only our titles).
  const { data: prior } = await admin
    .from("talent_bookings")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .ilike("title", `${TAG}%`);
  const priorIds = (prior ?? []).map((r) => r.id);
  if (priorIds.length) {
    await admin.from("booking_talent").delete().in("booking_id", priorIds);
    await admin.from("booking_deliverables").delete().in("booking_id", priorIds);
    await admin.from("talent_bookings").delete().in("id", priorIds);
    await admin.from("agency_bookings").delete().in("id", priorIds);
  }
  await admin
    .from("talent_holds")
    .delete()
    .eq("talent_profile_id", talentProfileId)
    .ilike("title", `${TAG}%`);

  async function insertBooking({
    title,
    clientName,
    startsAt,
    endsAt,
    paymentStatus,
    status = "confirmed",
    internalNotes,
  }) {
    const { data: agencyRow, error: agencyErr } = await admin
      .from("agency_bookings")
      .insert({
        tenant_id: tenantId,
        source_inquiry_id: null,
        owner_staff_id: createdByUserId,
        created_by_staff_id: createdByUserId,
        title: `${TAG} ${title}`,
        status,
        payment_status: paymentStatus,
        currency_code: "MXN",
        // Cents — Finish→Card needs amount due to mint a real /pay link (A1.1).
        total_client_revenue: 85000,
        starts_at: startsAt,
        ends_at: endsAt,
        contact_name: clientName,
        source_type_snapshot: "manual",
        internal_notes: internalNotes ?? `${TAG} fixture`,
      })
      .select("id")
      .single();
    if (agencyErr || !agencyRow) {
      console.warn(`[seed] agency_bookings ${title}:`, agencyErr?.message);
      return null;
    }
    const bookingId = agencyRow.id;
    const { error: legErr } = await admin.from("booking_talent").insert({
      tenant_id: tenantId,
      booking_id: bookingId,
      talent_profile_id: talentProfileId,
      sort_order: 0,
      units: 1,
      pricing_unit: "event",
      talent_cost_rate: 0,
      client_charge_rate: 85000,
      talent_cost_total: 0,
      client_charge_total: 85000,
      gross_profit: 85000,
    });
    if (legErr) {
      console.warn(`[seed] booking_talent ${title}:`, legErr.message);
      await admin.from("agency_bookings").delete().eq("id", bookingId);
      return null;
    }
    const { error: calErr } = await admin.from("talent_bookings").insert({
      id: bookingId,
      talent_profile_id: talentProfileId,
      tenant_id: tenantId,
      title: `${TAG} ${title}`,
      client_label: clientName,
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: false,
      status: status === "confirmed" ? "confirmed" : "confirmed",
      created_by_user_id: createdByUserId,
    });
    if (calErr) {
      console.warn(`[seed] talent_bookings ${title}:`, calErr.message);
      await admin.from("booking_talent").delete().eq("booking_id", bookingId);
      await admin.from("agency_bookings").delete().eq("id", bookingId);
      return null;
    }
    return bookingId;
  }

  const b1 = await insertBooking({
    title: "Gel set",
    clientName: "Camila Ruiz",
    startsAt: "2026-09-23T10:00:00-05:00",
    endsAt: "2026-09-23T11:00:00-05:00",
    paymentStatus: "unpaid",
  });
  const b2 = await insertBooking({
    title: "Volume lashes",
    clientName: "Ana López",
    startsAt: "2026-09-23T12:00:00-05:00",
    endsAt: "2026-09-23T14:15:00-05:00",
    paymentStatus: "partial",
  });
  const b3 = await insertBooking({
    title: "Brows",
    clientName: "Lucía Méndez",
    startsAt: "2026-09-23T16:00:00-05:00",
    endsAt: "2026-09-23T17:30:00-05:00",
    paymentStatus: "unpaid",
    internalNotes: `${TAG} overdue fixture — due before appointment`,
  });

  const { error: holdErr } = await admin.from("talent_holds").insert({
    talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    title: `${TAG} Full set`,
    client_label: "Sofía Vega",
    starts_at: "2026-09-24T11:00:00-05:00",
    ends_at: "2026-09-24T13:00:00-05:00",
    all_day: false,
    hold_strength: "soft",
    expires_at: "2026-09-23T11:40:00-05:00",
    created_by_user_id: createdByUserId,
  });
  if (holdErr) console.warn("[seed] hold:", holdErr.message);

  // Project-style deadline (no appointment window) via deliverable on a draft booking.
  const deadlineBk = await insertBooking({
    title: "Project quote deadline",
    clientName: "Deadline Client",
    startsAt: "2026-09-26T09:00:00-05:00",
    endsAt: "2026-09-26T09:30:00-05:00",
    paymentStatus: "unpaid",
    status: "draft",
  });
  if (deadlineBk) {
    const { error: delErr } = await admin.from("booking_deliverables").insert({
      booking_id: deadlineBk,
      tenant_id: tenantId,
      title: `${TAG} Moodboard due`,
      kind: "service",
      status: "draft",
      due_at: "2026-09-25T18:00:00-05:00",
      notes: `${TAG} fixture`,
    });
    if (delErr) console.warn("[seed] deliverable:", delErr.message);
  }

  console.log(
    `[seed] week fixtures: bookings=${[b1, b2, b3, deadlineBk].filter(Boolean).length} hold=${holdErr ? "fail" : "ok"}`,
  );
}

async function main() {
  if (flag("reset")) {
    await resetTagged();
    if (!flag("i-understand-this-writes-to-the-database")) return;
  }

  console.log(`[seed] clock reference ${CLOCK}`);
  console.log(`[seed] target ${url}`);

  const agencyId = await resolveQaAgencyId();
  if (agencyId) console.log(`[seed] QA agency tenant ${agencyId}`);
  else console.warn("[seed] No QA agency found — hours rows will be skipped");

  // Optional dedicated login for the primary beauty talent (never steals
  // IMPERSONATION_QA_TALENT_USER_ID — that user already owns another profile).
  const primaryPassword =
    (process.env.QA_AGENDA_TALENT_PASSWORD ?? process.env.QA_TALENT_PASSWORD ?? "qa-agenda-v2-local").trim();

  async function ensureLogin(email, displayName) {
    const target = email.toLowerCase();
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.warn("[seed] listUsers:", error.message);
        return null;
      }
      const found = (data.users ?? []).find((u) => u.email?.toLowerCase() === target);
      if (found) {
        await admin.auth.admin.updateUserById(found.id, {
          password: primaryPassword,
          email_confirm: true,
        });
        return found.id;
      }
      if ((data.users ?? []).length < 200) break;
      page += 1;
    }
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: primaryPassword,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });
    if (createErr) {
      console.warn("[seed] createUser:", createErr.message);
      return null;
    }
    return created.user?.id ?? null;
  }

  const kinds = [
    {
      slug: "qa-agenda-jor",
      displayName: "QA Agenda Jor",
      email: "qa-agenda-jor@impronta.test",
      kind: "beauty",
      withLogin: true,
    },
    { slug: "qa-agenda-barber", displayName: "QA Agenda Barber", email: "qa-agenda-barber@impronta.test", kind: "barber" },
    { slug: "qa-agenda-chef", displayName: "QA Agenda Chef", email: "qa-agenda-chef@impronta.test", kind: "chef" },
    { slug: "qa-agenda-dancer", displayName: "QA Agenda Dancer", email: "qa-agenda-dancer@impronta.test", kind: "dancer" },
    { slug: "qa-agenda-design", displayName: "QA Agenda Design", email: "qa-agenda-design@impronta.test", kind: "design" },
  ];

  const created = [];
  for (const k of kinds) {
    let userId = null;
    if (k.withLogin) {
      userId = await ensureLogin(k.email, k.displayName);
      if (userId) {
        // Ensure profiles.app_role so /talent routes resolve.
        await admin.from("profiles").upsert(
          {
            id: userId,
            display_name: k.displayName,
            app_role: "talent",
            account_status: "active",
          },
          { onConflict: "id" },
        );
      }
    }
    const t = await findOrCreateTalent({ ...k, userId });
    if (!t._virtual) {
      if (userId) {
        const { error: linkErr } = await admin
          .from("talent_profiles")
          .update({ user_id: userId })
          .eq("id", t.id);
        if (linkErr) console.warn(`[seed] link ${k.slug}:`, linkErr.message);
      }
      await seedHours(t.id, agencyId);
    }
    created.push({
      ...k,
      id: t.id,
      virtual: Boolean(t._virtual),
      userId: userId,
      loginEmail: k.withLogin ? k.email : null,
    });
    console.log(`  ${k.kind.padEnd(8)} ${t.id}  ${k.slug}`);

    if (k.withLogin && !t._virtual && agencyId && userId) {
      await seedWeekFixtures(t.id, agencyId, userId);
    }
  }

  console.log(`
[seed] Done. Wire these profile ids into TALENT_AGENDA_V2_TALENTS for QA.
[seed] Primary login (beauty): qa-agenda-jor@impronta.test / (QA_AGENDA_TALENT_PASSWORD or default)
[seed] Week fixtures (today bookings + hold + deadline) land on the primary beauty talent.
`);
  console.log(JSON.stringify({ tag: TAG, talents: created }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
