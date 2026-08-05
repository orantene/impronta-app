#!/usr/bin/env node
/**
 * Re-face the platform demo talent: seed one approved `card` media_assets row
 * (+ storage upload) for every publicly-listed demo profile that lost its
 * imagery in the 2026-05 storage cleanup (the `demo/TAL-91xxx` objects were
 * deleted from `media-public`, then cleanup-orphan-media-rows.ts correctly
 * soft-deleted the dangling rows — leaving ~49 listed profiles rendering as
 * initials on tulala.digital/directory).
 *
 * Owner-approved 2026-08-05: demo profiles stay visible and get real demo
 * photos back.
 *
 * Modeled on scripts/seed-midnight-talent-media.mjs (the seeder that gave
 * midnight-muse its 5/5 faces): curated Unsplash editorial portraits
 * (Unsplash License — free commercial use, no attribution required),
 * downloaded at 1200×1500 (4:5, the directory card ratio), uploaded via
 * service role, one approved card row per profile.
 *
 * Design:
 *  - Identities are keyed by display_name: the same demo person mirrored
 *    across several QA workspaces (Camila Ortega ×3, Luna Alvarez ×4, …)
 *    gets the SAME photo on every copy.
 *  - Each identity has a preferred portrait; if its download fails the
 *    script falls back to the next unused image in the same-gender pool,
 *    so a dead Unsplash id degrades gracefully instead of failing the run.
 *  - Idempotent: profiles that already have a live approved card row are
 *    skipped. Re-running is safe.
 *
 * Run:  node scripts/seed-demo-talent-media.mjs          (dry run)
 *       node scripts/seed-demo-talent-media.mjs --apply  (writes)
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

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const BUCKET = "media-public";
/** tulala hub — every target profile is rostered there (verified 2026-08-05). */
const TULALA_TENANT = "40081ec3-5ca8-43a0-b50b-31c927b2716b";

// ─── Portrait pools (Unsplash photo ids, editorial portrait orientation) ─────
// Validated at runtime; order matters — fallbacks walk the pool.
const POOL_W = [
  "photo-1494790108377-be9c29b29330",
  "photo-1438761681033-6461ffad8d80",
  "photo-1544005313-94ddf0286df2",
  "photo-1487412720507-e7ab37603c6f",
  "photo-1524504388940-b1c1722653e1",
  "photo-1529626455594-4ff0802cfb7e",
  "photo-1508214751196-bcfd4ca60f91",
  "photo-1517841905240-472988babdf9",
  "photo-1534528741775-53994a69daeb",
  "photo-1488426862026-3ee34a7d66df",
  "photo-1521146764736-56c929d59c83",
  "photo-1502823403499-6ccfcf4fb453",
  "photo-1531746020798-e6953c6e8e04",
  "photo-1489424731084-a5d8b219a5bb",
  "photo-1506863530036-1efeddceb993",
  "photo-1499952127939-9bbf5af6c51c",
  "photo-1479936343636-73cdc5aae0c3",
  "photo-1541823709867-1b206113eafd",
  "photo-1520813792240-56fc4a3765a7",
  "photo-1554151228-14d9def656e4",
  "photo-1524250502761-1ac6f2e30d43",
  "photo-1580489944761-15a19d654956",
  "photo-1567532939604-b6b5b0db2604",
  "photo-1531123897727-8f129e1688ce",
  "photo-1508002366005-75a695ee2d17",
  "photo-1519742866993-66d3cfef4bbd",
  "photo-1516726817505-f5ed825624d8",
  "photo-1502378735452-bc7d86632805",
  "photo-1512310604669-443f26c35f52",
  "photo-1530785602389-07594beb8b73",
];
const POOL_M = [
  "photo-1507003211169-0a1dd7228f2d",
  "photo-1500648767791-00dcc994a43e",
  "photo-1506794778202-cad84cf45f1d",
  "photo-1519085360753-af0119f7cbe7",
  "photo-1492562080023-ab3db95bfbce",
  "photo-1504257432389-52343af06ae3",
  "photo-1472099645785-5658abf4ff4e",
  "photo-1519345182560-3f2917c472ef",
  "photo-1463453091185-61582044d556",
  "photo-1521119989659-a83eee488004",
  "photo-1508341591423-4347099e1f19",
  "photo-1547425260-76bcadfb4f2c",
  "photo-1560250097-0b93528c311a",
  "photo-1552374196-c4e7ffc6e126",
  "photo-1564564321837-a57b7070ac4f",
  "photo-1566492031773-4f4e44671857",
];

const src = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&h=1500&q=80`;

// ─── Targets: the 49 faceless listed profiles (queried 2026-08-05) ───────────
// gender drives pool choice; identities share a photo across profile copies.
const IDENTITIES = {
  //  name                     gender  preferred pool index
  "Adriana Vega":     { g: "w", i: 0 },
  "Alba Reyes":       { g: "w", i: 1 },
  "Alexa Mendez":     { g: "w", i: 2 },
  "Ariadne Okafor":   { g: "w", i: 3 },
  "Camila Ortega":    { g: "w", i: 4 },
  "Chiara Moretti":   { g: "w", i: 5 },
  "Daniela Llopis":   { g: "w", i: 6 },
  "Daniela Mizrahi":  { g: "w", i: 7 },
  "Elena Petrov":     { g: "w", i: 8 },
  "Emilia Roca":      { g: "w", i: 9 },
  "Isabella Flores":  { g: "w", i: 10 },
  "Jasmine Brooks":   { g: "w", i: 11 },
  "Juniper Okoye":    { g: "w", i: 12 },
  "Kaia Marchetti":   { g: "w", i: 13 },
  "Lucia Navarro":    { g: "w", i: 14 },
  "Luna Alvarez":     { g: "w", i: 15 },
  "Mariana Costa":    { g: "w", i: 16 },
  "Nina Hart":        { g: "w", i: 17 },
  "Noor Hassan":      { g: "w", i: 18 },
  "Olivia Terán":     { g: "w", i: 19 },
  "Reina Vásquez":    { g: "w", i: 20 },
  "Sara Levy":        { g: "w", i: 21 },
  "Sofia Bennett":    { g: "w", i: 22 },
  "Valentina Ruiz":   { g: "w", i: 23 },
  "Chris Rosillo":    { g: "m", i: 0 },
  "Diego Rios":       { g: "m", i: 1 },
  "Eric Watson":      { g: "m", i: 2 },
  "Luca Ferrari":     { g: "m", i: 3 },
  "Marco Sánchez":    { g: "m", i: 4 },
  "Marcos Ribó":      { g: "m", i: 5 },
  "Mateo Rossi":      { g: "m", i: 6 },
  "Mateo Silva":      { g: "m", i: 7 },
  "Noah Klein":       { g: "m", i: 8 },
  "Noah Sinclair":    { g: "m", i: 9 },
  "Omar Haddad":      { g: "m", i: 10 },
  "Rafael Ibarra":    { g: "m", i: 11 },
};

const PROFILES = [
  ["8e3c2d19-9c04-4e9a-b3a3-7d9807d7254c", "Adriana Vega"],
  ["c5ff8bcb-0887-4894-8338-faca4001102b", "Alba Reyes"],
  ["5945b6d3-63e4-4ab1-8d8d-049807686317", "Alexa Mendez"],
  ["75956aad-9ca5-4ac6-9fc9-56851edce7f5", "Ariadne Okafor"],
  ["0a762cc3-3f67-49c3-b417-28643d759fef", "Camila Ortega"],
  ["63c4d510-197a-46f7-93aa-92d42137de15", "Camila Ortega"],
  ["d1c07836-21d6-428d-adef-2b6a2adce5bd", "Camila Ortega"],
  ["fd0b0a9f-82d1-4701-b757-32d26d4821d3", "Chiara Moretti"],
  ["0102f575-3b57-479b-9e6d-e2c5d78e5e9c", "Chris Rosillo"],
  ["046cc25f-8de3-400b-a337-03518f8e7863", "Daniela Llopis"],
  ["2e4e9011-5da7-4ad9-9219-aaf96a161cf8", "Daniela Mizrahi"],
  ["dc2dc62b-2056-443f-8dab-75bc6dec38d9", "Diego Rios"],
  ["2122c70b-425c-4ae4-8998-6c031c12e92e", "Elena Petrov"],
  ["1fd9d6ed-ccec-463c-805f-ce11334b3b49", "Emilia Roca"],
  ["c61ef2f1-a650-4b67-9652-995ab882fd7e", "Eric Watson"],
  ["0cc845fd-7fc9-47dd-b5f3-f8d02f9fbcfc", "Isabella Flores"],
  ["0eae642d-640d-4a2f-8012-51f3ad20d685", "Jasmine Brooks"],
  ["b3f283a4-423b-4b79-872b-519aac3dcc71", "Juniper Okoye"],
  ["83aaf103-e8c5-469a-9594-ff713d2336b2", "Kaia Marchetti"],
  ["33d7d2c6-e72b-4f35-941c-f8309c243726", "Luca Ferrari"],
  ["2bfb0110-d0ab-447d-8a3e-1bf72e6ff5ba", "Lucia Navarro"],
  ["37545d15-84c2-49eb-9065-218c9257893b", "Luna Alvarez"],
  ["c8f7ac0b-be18-4d5d-8b71-e0abd5ba447d", "Luna Alvarez"],
  ["90986dc0-3357-4d0c-a348-f2265db9949e", "Luna Alvarez"],
  ["6d0f02d3-1ddd-476a-8a5e-f6aa44175568", "Luna Alvarez"],
  ["de81316a-8939-49d0-afbc-f946c64648af", "Marco Sánchez"],
  ["77568dd9-9bff-429a-84e4-99fea2858f4a", "Marcos Ribó"],
  ["ed0403e0-5fbc-4c3f-a01c-0e3fdf20042b", "Mariana Costa"],
  ["cb2e6abf-0a09-4cf3-b427-b5ba769c2fc0", "Mateo Rossi"],
  ["b41d7836-80ec-4592-ac3b-c2e3fe964662", "Mateo Rossi"],
  ["2ab2ee00-c927-49aa-8454-5cf796d17881", "Mateo Rossi"],
  ["6fc2d5c2-9ebd-4d81-a382-99606a35a27a", "Mateo Rossi"],
  ["e59d6ffa-261e-4dc6-b193-0841da83d600", "Mateo Silva"],
  ["00fc9051-1ead-4ccb-b799-65815c6f3b3f", "Nina Hart"],
  ["76cfd0ca-472f-4684-8ac5-214dc961e797", "Noah Klein"],
  ["be5f54d7-deb8-45af-a0ab-084ea45e47a5", "Noah Sinclair"],
  ["fc8d6916-9b9f-4509-9a53-c1a7e717658e", "Noah Sinclair"],
  ["4b7a66c6-b0af-4798-9152-91bd6d7a64ff", "Noah Sinclair"],
  ["b9b74b18-533b-477d-9500-4abf8da38b1e", "Noor Hassan"],
  ["9368067e-2124-44e3-9b7b-d6ed0d61e9b1", "Olivia Terán"],
  ["7ac2361e-83d5-4867-9f8d-cedd40ac9484", "Omar Haddad"],
  ["26d7ddb4-c563-4af7-9369-3edde649e2fd", "Rafael Ibarra"],
  ["6c63459c-33b0-4276-824d-1813a9aaa62c", "Reina Vásquez"],
  ["ab4c83df-4b83-4b92-a7f6-fe88cd5ae348", "Sara Levy"],
  ["bf13b7f2-2e59-4196-a3ff-905a561660ed", "Sofia Bennett"],
  ["f87f471b-937d-4342-ad85-3317b17b296e", "Sofia Bennett"],
  ["750aafb9-5011-4f0b-831c-9e05e4223860", "Sofia Bennett"],
  ["026505a2-89e7-4eb8-97f3-fb2dc20f3cca", "Sofia Bennett"],
  ["22f62c40-f790-411e-bee0-26fc5dd94bf5", "Valentina Ruiz"],
];

// ─── Supabase REST helpers (service role) ────────────────────────────────────
const restHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function restGet(table, query) {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, { headers: restHeaders });
  if (!res.ok) throw new Error(`GET ${table} ${res.status} ${await res.text()}`);
  return res.json();
}

async function restInsert(table, body) {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`INSERT ${table} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function uploadToStorage(objectPath, buffer) {
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      "Cache-Control": "3600",
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`upload ${objectPath} ${res.status} ${await res.text()}`);
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`not an image: ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 30_000) throw new Error(`suspiciously small (${buf.length}B)`);
  return buf;
}

// ─── Assign one validated portrait per identity ──────────────────────────────
const used = new Set();
/** name → { buf, unsplashId } */
const portraitByIdentity = new Map();

async function resolvePortrait(name, spec) {
  const pool = spec.g === "m" ? POOL_M : POOL_W;
  // Preferred index first, then walk the rest of the pool for the first
  // unused id that actually downloads.
  const order = [
    pool[spec.i % pool.length],
    ...pool.filter((_, idx) => idx !== spec.i % pool.length),
  ];
  for (const id of order) {
    if (used.has(id)) continue;
    try {
      const buf = await download(src(id));
      used.add(id);
      return { buf, unsplashId: id };
    } catch (e) {
      console.warn(`  ${name}: ${id} unusable (${String(e).slice(0, 80)}) — trying next`);
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${PROFILES.length} profiles, ${Object.keys(IDENTITIES).length} identities\n`);

let seeded = 0, skipped = 0, failed = 0;

for (const [name, spec] of Object.entries(IDENTITIES)) {
  const copies = PROFILES.filter(([, n]) => n === name);
  if (copies.length === 0) continue;

  const portrait = await resolvePortrait(name, spec);
  if (!portrait) {
    console.error(`✗ ${name}: no usable portrait left in pool — ${copies.length} profile(s) skipped`);
    failed += copies.length;
    continue;
  }
  portraitByIdentity.set(name, portrait.unsplashId);

  for (const [profileId] of copies) {
    const existing = await restGet(
      "media_assets",
      new URLSearchParams({
        select: "id",
        owner_talent_profile_id: `eq.${profileId}`,
        variant_kind: "eq.card",
        approval_state: "eq.approved",
        deleted_at: "is.null",
      }).toString(),
    );
    if (existing.length > 0) {
      console.log(`• ${name} (${profileId.slice(0, 8)}): approved card exists — skip`);
      skipped++;
      continue;
    }

    const storagePath = `talent/${profileId}/card.jpg`;
    if (!APPLY) {
      console.log(`~ ${name} (${profileId.slice(0, 8)}): would upload ${portrait.unsplashId} → ${storagePath}`);
      seeded++;
      continue;
    }

    await uploadToStorage(storagePath, portrait.buf);
    await restInsert("media_assets", [{
      tenant_id: TULALA_TENANT,
      owner_talent_profile_id: profileId,
      bucket_id: BUCKET,
      storage_path: storagePath,
      variant_kind: "card",
      approval_state: "approved",
      purpose: "talent",
      sort_order: 0,
      width: 1200,
      height: 1500,
      file_size: portrait.buf.length,
      metadata: {
        source: "unsplash-demo-reseed",
        unsplash_id: portrait.unsplashId,
        seeded_by: "seed-demo-talent-media.mjs",
      },
    }]);
    console.log(`✓ ${name} (${profileId.slice(0, 8)}): ${portrait.unsplashId} → ${storagePath} (${portrait.buf.length}B)`);
    seeded++;
  }
}

console.log(`\n${APPLY ? "Seeded" : "Would seed"}: ${seeded} · skipped (already have card): ${skipped} · failed: ${failed}`);
if (!APPLY) console.log("Re-run with --apply to write.");
