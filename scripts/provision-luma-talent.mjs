#!/usr/bin/env node
// One-shot: seed 5 native Luma Studio Roster talent profiles via service-role REST.
// Mirrors provision-midnight-talent.mjs. Softer commercial/editorial lineup —
// fashion, lifestyle, catalog, content creator, brand ambassador — for a
// daytime Iberian tone (Barcelona / Madrid / Lisbon).

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

const LUMA_TENANT = "55555555-5555-5555-5555-555555555555";
const OWNER_USER_ID = "1260a7bc-709d-4ae4-a824-7d89bae468e4";

const TALENT = [
  {
    display_name: "Alba Reyes",
    first_name: "Alba",
    last_name: "Reyes",
    slug: "alba-reyes",
    talent_type_id: "ce0c19f7-9fa6-424a-988f-dadbeab61aea", // Fashion Model
    short_bio:
      "Editorial and runway face based in Barcelona. Campaigns for resortwear, fragrance and independent designers across Iberia.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Olivia Terán",
    first_name: "Olivia",
    last_name: "Terán",
    slug: "olivia-teran",
    talent_type_id: "8dc54b18-049a-4028-8673-52f87c881093", // Lifestyle Model
    short_bio:
      "Lifestyle and wellness storytelling. Warm, daylight-driven campaigns for skincare, home goods and slow-living brands.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Marcos Ribó",
    first_name: "Marcos",
    last_name: "Ribó",
    slug: "marcos-ribo",
    talent_type_id: "4c81fbb7-372b-4463-8513-75975b5fbf96", // Commercial Model
    short_bio:
      "Commercial lead for lookbooks, e-commerce and broadcast. Calm on-camera presence across menswear and lifestyle work.",
    gender: "male",
    hero_image:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Emilia Roca",
    first_name: "Emilia",
    last_name: "Roca",
    slug: "emilia-roca",
    talent_type_id: "149f901e-49bb-4529-9f70-1ca5a2bb609e", // Content Creator
    short_bio:
      "Content creator across fashion, food and travel. Native bilingual (ES/EN). Campaigns for lifestyle and hospitality brands.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    display_name: "Daniela Llopis",
    first_name: "Daniela",
    last_name: "Llopis",
    slug: "daniela-llopis",
    talent_type_id: "1ba1bd97-3939-48a0-abd5-d8b907418932", // Brand Ambassador
    short_bio:
      "Brand ambassador for retail activations and showroom weeks. Known for composed hosting across Madrid fashion calendar.",
    gender: "female",
    hero_image:
      "https://images.unsplash.com/photo-1512310604669-443f26c35f52?auto=format&fit=crop&w=1200&q=80",
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
      tenant_id: LUMA_TENANT,
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
