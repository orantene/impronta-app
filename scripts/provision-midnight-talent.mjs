#!/usr/bin/env node
// One-shot: seed 5 native Midnight Muse talent profiles via service-role REST.
// Mirrors the admin/talent/new server action flow:
//   1. RPC generate_profile_code → profile_code
//   2. INSERT talent_profiles (draft / hidden / free tier)
//   3. INSERT agency_talent_roster (tenant-scoped, source=agency_created)
//   4. INSERT talent_profile_taxonomy (primary talent type)
//   5. UPDATE workflow_status=approved, visibility=public, agency_visibility=site_visible
//      (so they render on the public storefront immediately).
// Profiles get short bios + a hero photo via field_values (headshot slot).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "web",
  ".env.local",
);
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 0) return null;
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
    .filter(Boolean),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Missing env");
  process.exit(1);
}

const MIDNIGHT_TENANT = "44444444-4444-4444-4444-444444444444";
const OWNER_USER_ID = "1260a7bc-709d-4ae4-a824-7d89bae468e4";

const TALENT = [
  {
    display_name: "Renata Solé",
    first_name: "Renata",
    last_name: "Solé",
    slug: "renata-sole",
    talent_type_id: "b8a95f39-35b5-4bb7-93eb-400dd5290ff7", // DJ
    short_bio:
      "Resident DJ between Tulum and Miami. House-meets-editorial sets for hotel openings, private villas and curated afterhours.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1526178613552-2b45c6c302f0?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Jovan Amari",
    first_name: "Jovan",
    last_name: "Amari",
    slug: "jovan-amari",
    talent_type_id: "d5da2faf-948a-4e60-8ddb-eb2cdcdb3b5f", // Entertainer
    short_bio:
      "Silk aerialist and cirque performer. Headline acts for product launches, gala dinners and rooftop receptions.",
    gender: "male",
    hero_image:
      "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Ines Montaner",
    first_name: "Ines",
    last_name: "Montaner",
    slug: "ines-montaner",
    talent_type_id: "753e2977-3307-4913-a0c8-b33ec5ac93f5", // Editorial Model
    short_bio:
      "Spanish-born editorial face. Long-form campaigns, resortwear editorials and nighttime brand stories on the Riviera Maya.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Kaya Noor",
    first_name: "Kaya",
    last_name: "Noor",
    slug: "kaya-noor",
    talent_type_id: "2341fbbb-8038-4295-8dc3-02b5ee3b93d9", // Event Model
    short_bio:
      "Event-floor presence specialist. Runs floor teams for fashion showrooms, after-parties and sponsor activations.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1488716820095-cbc6e89777e6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Liora Vance",
    first_name: "Liora",
    last_name: "Vance",
    slug: "liora-vance",
    talent_type_id: "75cee48e-d89e-43b5-b25d-da6abd2f8c09", // Hostess
    short_bio:
      "Trilingual VIP host. Guest-list management, private-room coordination and talent wrangling for marquee nights.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=1200&q=80",
  },
];

const headers = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rpc(fn, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status} ${await res.text()}`);
  return res.json();
}

async function insert(table, body) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${table} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function update(table, query, body) {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PATCH ${table} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findExistingByDisplayName(displayName) {
  const q = new URLSearchParams({
    select: "id",
    display_name: `eq.${displayName}`,
  });
  const res = await fetch(`${URL}/rest/v1/talent_profiles?${q}`, { headers });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  const rows = await res.json();
  return rows[0]?.id ?? null;
}

for (const t of TALENT) {
  const existing = await findExistingByDisplayName(t.display_name);
  if (existing) {
    console.log(`skip ${t.display_name} (exists ${existing})`);
    continue;
  }
  const code = await rpc("generate_profile_code");
  const [profile] = await insert("talent_profiles", [
    {
      profile_code: String(code),
      display_name: t.display_name,
      first_name: t.first_name,
      last_name: t.last_name,
      short_bio: t.short_bio,
      gender: t.gender,
      workflow_status: "approved",
      visibility: "public",
      membership_tier: "free",
      membership_status: "active",
      is_featured: true,
    },
  ]);
  console.log(`created ${t.display_name} ${profile.id} ${code}`);
  await insert("agency_talent_roster", [
    {
      tenant_id: MIDNIGHT_TENANT,
      talent_profile_id: profile.id,
      source_type: "agency_created",
      status: "active",
      agency_visibility: "featured",
      added_by: OWNER_USER_ID,
    },
  ]);
  await insert("talent_profile_taxonomy", [
    {
      talent_profile_id: profile.id,
      taxonomy_term_id: t.talent_type_id,
      is_primary: true,
    },
  ]);
  // Attach a hero photo via talent_profile_photos (not field_values).
  await insert("talent_profile_photos", [
    {
      talent_profile_id: profile.id,
      storage_path: t.hero_image,
      sort_order: 0,
      is_primary: true,
    },
  ]).catch((e) => console.warn("photo insert failed:", String(e).slice(0, 200)));
}
console.log("done");
