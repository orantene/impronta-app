#!/usr/bin/env node
/**
 * Seed approved `media_assets` rows for Midnight Muse's 5 talents so the
 * featured_talent section renders portraits instead of initials.
 *
 * Flow per talent:
 *   1. Download a portrait-oriented Unsplash image (editorial-bridal tone).
 *   2. Upload to the public `media-public` bucket at
 *      `talent/<profile_id>/card.jpg` using the service-role API.
 *   3. Insert a media_assets row with variant_kind='card',
 *      approval_state='approved', purpose='talent', owner linked to the
 *      talent profile, tenant_id=Midnight.
 *
 * Idempotency: skip if a row already exists for this owner + variant.
 * Re-running is safe; the upload will overwrite (upsert=true).
 */

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

/**
 * Portrait-oriented (3:4) editorial imagery matching Editorial Bridal's
 * warm palette. URLs request auto format, 3:4 crop, and 1200×1600 resolution.
 */
const TALENTS = [
  {
    profile_id: "271c9d73-517d-457b-945f-ac84422f3a12", // TAL-00009 Renata Solé
    display_name: "Renata Solé",
    src: "https://images.unsplash.com/photo-1526178613552-2b45c6c302f0?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    profile_id: "2e50d9d1-ffa7-4997-9800-d8b1f520ef38", // TAL-00010 Jovan Amari
    display_name: "Jovan Amari",
    src: "https://images.unsplash.com/photo-1504609813442-a8924e83f76e?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    profile_id: "3a1f510a-9610-4f41-9e4d-4d844d1b62db", // TAL-00011 Ines Montaner
    display_name: "Ines Montaner",
    src: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&h=1600&q=80",
  },
  {
    profile_id: "8a7d6e82-6600-469b-b4f7-52b22ae03e98", // TAL-00012 Kaya Noor
    display_name: "Kaya Noor",
    // Fallbacks tried in order; first 200 wins.
    srcCandidates: [
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&h=1600&q=80",
      "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=1200&h=1600&q=80",
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1200&h=1600&q=80",
    ],
  },
  {
    profile_id: "c162b4a3-7ad7-4b06-bee0-ab81772e9f71", // TAL-00013 Liora Vance
    display_name: "Liora Vance",
    srcCandidates: [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&h=1600&q=80",
      "https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=1200&h=1600&q=80",
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&h=1600&q=80",
    ],
  },
];

const BUCKET = "media-public";
const restHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function restGet(table, query) {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: restHeaders,
  });
  if (!res.ok) throw new Error(`GET ${table} ${res.status} ${await res.text()}`);
  return res.json();
}

async function restInsert(table, body) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`INSERT ${table} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function downloadFirstAvailable(candidates) {
  const errors = [];
  for (const url of candidates) {
    try {
      return { url, buf: await downloadImage(url) };
    } catch (e) {
      errors.push(String(e).slice(0, 200));
    }
  }
  throw new Error(`all candidates failed: ${errors.join(" | ")}`);
}

async function uploadToStorage(bucket, objectPath, buffer, contentType) {
  const res = await fetch(
    `${URL}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": contentType,
        "x-upsert": "true",
        "Cache-Control": "3600",
      },
      body: buffer,
    },
  );
  if (!res.ok) throw new Error(`upload ${objectPath} ${res.status} ${await res.text()}`);
  return res.json();
}

for (const t of TALENTS) {
  const storagePath = `talent/${t.profile_id}/card.jpg`;

  const existing = await restGet(
    "media_assets",
    new URLSearchParams({
      select: "id",
      owner_talent_profile_id: `eq.${t.profile_id}`,
      variant_kind: "eq.card",
      deleted_at: "is.null",
    }).toString(),
  );
  const sources = t.srcCandidates ?? (t.src ? [t.src] : []);

  if (existing.length > 0) {
    console.log(`${t.display_name}: row exists (${existing[0].id}) — skipping insert, re-uploading file`);
    try {
      const { buf } = await downloadFirstAvailable(sources);
      await uploadToStorage(BUCKET, storagePath, buf, "image/jpeg");
      console.log(`  uploaded ${buf.length} bytes to ${storagePath}`);
    } catch (e) {
      console.warn(`  upload skipped: ${String(e).slice(0, 200)}`);
    }
    continue;
  }

  console.log(`${t.display_name}: downloading…`);
  let buf;
  try {
    const d = await downloadFirstAvailable(sources);
    buf = d.buf;
    console.log(`  ${buf.length} bytes (from ${d.url.slice(0, 80)}…)`);
  } catch (e) {
    console.warn(`  all candidates failed — skipping insert: ${String(e).slice(0, 200)}`);
    continue;
  }

  await uploadToStorage(BUCKET, storagePath, buf, "image/jpeg");
  console.log(`  uploaded to ${BUCKET}/${storagePath}`);

  const [row] = await restInsert("media_assets", [
    {
      tenant_id: MIDNIGHT_TENANT,
      owner_talent_profile_id: t.profile_id,
      bucket_id: BUCKET,
      storage_path: storagePath,
      variant_kind: "card",
      approval_state: "approved",
      purpose: "talent",
      sort_order: 0,
      width: 1200,
      height: 1600,
      file_size: buf.length,
      metadata: { source: "unsplash-seed", seeded_by: "seed-midnight-talent-media.mjs" },
    },
  ]);
  console.log(`  media_assets row ${row.id}`);
}

console.log("\nDone. Verify with:");
console.log(
  "  curl -s http://midnight.lvh.me:3106/ | grep -c 'data-card-media'",
);
