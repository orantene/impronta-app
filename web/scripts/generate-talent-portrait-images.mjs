#!/usr/bin/env node
/**
 * Generates images and uploads to Supabase Storage at existing `media_assets` paths.
 *
 * Kinds (--kind):
 *   card    — directory / profile avatar (default), 1080×1350
 *   banner  — profile cover / hero, 2400×1350
 *   gallery — portfolio stills, 1600×2000 (all approved gallery rows per profile)
 *   both    — card then banner for each profile (long run)
 *
 * Parallel terminals share Pollinations’ per-IP limit → 429s. Prefer one terminal, or use
 * --delay-ms=8000 (or POLLINATIONS_DELAY_MS) and stagger starts. Retries on 429/503 are built in.
 *
 * Sharding (stable sort by profile_code):
 *   npm run generate-talent-images-free -- --kind=banner --offset=0 --limit=3 --delay-ms=7000
 *
 * Providers:
 *   openai        — OPENAI_API_KEY (paid)
 *   pollinations  — AI, no key, often 429 when busy
 *   picsum        — stock photos, no key, reliable for UI demos (not AI / not on-prompt)
 * Auto: openai if key set, else pollinations.
 *
 * If Pollinations spins on 429: IMAGE_GEN_PROVIDER=picsum npm run generate:talent-images -- --kind=banner
 * Or: npm run generate-talent-images-stock
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import sharp from "sharp";

/** Demo pack TAL-910xx plus Tulum Spanish seed TAL-920xx (see supabase/seed_tulum_spanish_talent.sql). */
const DEMO_PROFILE_CODE = /^TAL-9[12]\d{3}$/;
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const BANNER_WIDTH = 2400;
const BANNER_HEIGHT = 1350;
const GALLERY_WIDTH = 1600;
const GALLERY_HEIGHT = 2000;

function parseArgs(argv) {
  let dryRun = false;
  let allProfiles = false;
  let limit = Infinity;
  let offset = 0;
  let kind = "card";
  /** null = use default / env; ms between successful Pollinations requests */
  let delayMsOverride = null;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--all") allProfiles = true;
    if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
    if (arg.startsWith("--offset=")) {
      const n = Number.parseInt(arg.slice("--offset=".length), 10);
      if (Number.isFinite(n) && n >= 0) offset = n;
    }
    if (arg.startsWith("--delay-ms=")) {
      const n = Number.parseInt(arg.slice("--delay-ms=".length), 10);
      if (Number.isFinite(n) && n >= 0) delayMsOverride = n;
    }
    if (arg.startsWith("--kind=")) {
      const k = arg.slice("--kind=".length).toLowerCase();
      if (k === "card" || k === "banner" || k === "both" || k === "gallery") kind = k;
      else {
        console.error(`Unknown --kind=${k}. Use card, banner, gallery, or both.`);
        process.exit(1);
      }
    }
  }
  return { dryRun, allProfiles, limit, offset, kind, delayMsOverride };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultPollinationsInterRequestMs() {
  const env = process.env.POLLINATIONS_DELAY_MS?.trim();
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 5500;
}

function defaultPicsumInterRequestMs() {
  const env = process.env.PICSUM_DELAY_MS?.trim();
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 450;
}

function pickMedia(row) {
  const ma = row.media_assets;
  if (!ma) return null;
  return Array.isArray(ma) ? ma[0] ?? null : ma;
}

function buildCardPrompt(profile) {
  const name = profile.display_name?.trim() || "Talent";
  const clip = profile.short_bio?.replace(/\s+/g, " ").trim().slice(0, 220) || "";
  const gender = (profile.gender ?? "").toLowerCase();
  const subject =
    gender === "male"
      ? "adult man"
      : gender === "female"
        ? "adult woman"
        : "adult person";

  return [
    `Professional agency headshot of one fictional ${subject}, original face not based on any real person or celebrity.`,
    `Luxury hospitality / events talent roster aesthetic: warm confident expression, soft studio key light, neutral out-of-focus background.`,
    `Vertical portrait framing: head and upper shoulders, editorial photography, photorealistic, sharp eyes.`,
    `No text, no watermark, no logos on the image.`,
    `Mood and styling hints only (do not write names on image): ${name}. ${clip}`,
  ].join(" ");
}

function buildGalleryPrompt(profile) {
  const name = profile.display_name?.trim() || "Talent";
  const clip = profile.short_bio?.replace(/\s+/g, " ").trim().slice(0, 200) || "";
  const gender = (profile.gender ?? "").toLowerCase();
  const subject =
    gender === "male"
      ? "adult man"
      : gender === "female"
        ? "adult woman"
        : "adult person";

  return [
    `Editorial lifestyle photograph of one fictional ${subject}, not based on any real celebrity.`,
    `Luxury destination / events portfolio look: natural light, tasteful wardrobe, relaxed confident pose.`,
    `Vertical editorial framing suitable for a talent portfolio grid, photorealistic, sharp focus.`,
    `No text, no watermark, no logos.`,
    `Mood hints only (do not render name as text): ${name}. ${clip}`,
  ].join(" ");
}

function buildBannerPrompt(profile) {
  const name = profile.display_name?.trim() || "Talent";
  const clip = profile.short_bio?.replace(/\s+/g, " ").trim().slice(0, 200) || "";
  const gender = (profile.gender ?? "").toLowerCase();
  const subject =
    gender === "male"
      ? "adult man"
      : gender === "female"
        ? "adult woman"
        : "adult person";

  return [
    `Wide cinematic hero photograph, landscape 16:9 feel, one fictional ${subject}, original person not based on any real celebrity.`,
    `Luxury resort or events brand campaign style: subject in elegant environment (terrace, soft sunset light, subtle architecture bokeh).`,
    `Full upper body or three-quarter shot with environmental context, shallow depth of field, editorial travel-lifestyle photography.`,
    `No text, no watermark, no logos, no UI.`,
    `Mood only (do not render name as text): ${name}. ${clip}`,
  ].join(" ");
}

function seedFromProfileCode(code, role) {
  const s = String(code ?? "") + String(role ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function resolveProvider(explicit, openaiKey) {
  const e = explicit?.trim().toLowerCase();
  if (e === "openai" || e === "pollinations" || e === "picsum") return e;
  if (e) {
    console.error(`Unknown IMAGE_GEN_PROVIDER "${explicit}". Use openai, pollinations, or picsum.`);
    process.exit(1);
  }
  return openaiKey ? "openai" : "pollinations";
}

/** Deterministic stock image (https://picsum.photos/) — not prompt-conditioned. */
async function fetchPicsumJpeg(width, height, profileCode, role) {
  const seed = `impronta-${profileCode}-${role}`.replace(/[^a-zA-Z0-9_-]/g, "");
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Picsum HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error("Picsum returned empty or tiny body");
  return buf;
}

async function fetchPollinationsPng(prompt, seed, width, height) {
  const maxLen = 1200;
  const p = prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}`;
  const maxAttempts = Number.parseInt(process.env.POLLINATIONS_MAX_RETRIES ?? "8", 10) || 8;
  const model = process.env.POLLINATIONS_MODEL?.trim();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const u = new URL(base);
    u.searchParams.set("width", String(width));
    u.searchParams.set("height", String(height));
    u.searchParams.set("nologo", "true");
    u.searchParams.set("seed", String(seed));
    if (model) u.searchParams.set("model", model);

    const res = await fetch(u.toString(), {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) {
        throw new Error("Pollinations returned empty or tiny body");
      }
      return buf;
    }

    const retryable = res.status === 429 || res.status === 503 || res.status === 502;
    if (retryable && attempt < maxAttempts) {
      const ra = res.headers.get("retry-after");
      let waitSec = ra ? Number.parseInt(ra, 10) : NaN;
      if (!Number.isFinite(waitSec) || waitSec < 1) {
        waitSec = Math.min(180, 25 * 2 ** (attempt - 1));
      }
      const jitter = Math.floor(Math.random() * 2000);
      const ms = waitSec * 1000 + jitter;
      console.warn(
        `  Pollinations ${res.status} — waiting ~${Math.round(ms / 1000)}s (retry ${attempt}/${maxAttempts})…`,
      );
      await sleep(ms);
      continue;
    }

    throw new Error(`Pollinations HTTP ${res.status} ${res.statusText}`);
  }

  throw new Error("Pollinations: max retries exceeded");
}

async function generateRawImageBuffer(
  provider,
  prompt,
  seed,
  openai,
  imageModel,
  role,
  profileCode,
) {
  const isBanner = role === "banner";
  const isGallery = role === "gallery";

  if (provider === "picsum") {
    const w = isBanner ? BANNER_WIDTH : isGallery ? GALLERY_WIDTH : CARD_WIDTH;
    const h = isBanner ? BANNER_HEIGHT : isGallery ? GALLERY_HEIGHT : CARD_HEIGHT;
    return fetchPicsumJpeg(w, h, profileCode, role);
  }

  if (provider === "pollinations") {
    const pw = isBanner ? 1920 : isGallery ? 1280 : CARD_WIDTH;
    const ph = isBanner ? 1080 : isGallery ? 1600 : CARD_HEIGHT;
    return fetchPollinationsPng(prompt, seed, pw, ph);
  }

  if (imageModel !== "dall-e-3" && imageModel !== "dall-e-2") {
    throw new Error("Unsupported OPENAI_IMAGE_MODEL. Use dall-e-3 or dall-e-2.");
  }
  const size = isBanner
    ? imageModel === "dall-e-3"
      ? "1792x1024"
      : "1024x1024"
    : isGallery
      ? imageModel === "dall-e-3"
        ? "1024x1792"
        : "1024x1024"
      : imageModel === "dall-e-3"
        ? "1024x1792"
        : "1024x1024";

  const gen = await openai.images.generate({
    model: imageModel,
    prompt,
    n: 1,
    size,
    response_format: "b64_json",
    ...(imageModel === "dall-e-3" ? { quality: "standard" } : {}),
  });
  const b64 = gen.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenAI.");
  return Buffer.from(b64, "base64");
}

async function fetchCardRows(supabase) {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select(
      `
      profile_code,
      display_name,
      short_bio,
      gender,
      media_assets!inner (
        id,
        storage_path,
        bucket_id,
        variant_kind,
        sort_order,
        approval_state,
        deleted_at
      )
    `,
    )
    .eq("media_assets.variant_kind", "card")
    .eq("media_assets.sort_order", 0)
    .eq("media_assets.approval_state", "approved")
    .is("media_assets.deleted_at", null);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((tp) => {
      const ma = pickMedia(tp);
      if (!ma?.storage_path || !ma.bucket_id) return null;
      return { tp, ma, role: "card" };
    })
    .filter(Boolean);
}

async function fetchGalleryRows(supabase) {
  const { data, error } = await supabase.from("media_assets").select(
    `
      id,
      storage_path,
      bucket_id,
      variant_kind,
      sort_order,
      talent_profiles!inner (
        profile_code,
        display_name,
        short_bio,
        gender
      )
    `,
  )
    .eq("variant_kind", "gallery")
    .eq("approval_state", "approved")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => {
      const tp = row.talent_profiles;
      if (!tp?.profile_code || !row.storage_path || !row.bucket_id) return null;
      const ma = {
        id: row.id,
        storage_path: row.storage_path,
        bucket_id: row.bucket_id,
        variant_kind: row.variant_kind,
        sort_order: row.sort_order,
      };
      return { tp, ma, role: "gallery" };
    })
    .filter(Boolean);
}

async function fetchBannerRows(supabase) {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select(
      `
      profile_code,
      display_name,
      short_bio,
      gender,
      media_assets!inner (
        id,
        storage_path,
        bucket_id,
        variant_kind,
        sort_order,
        approval_state,
        deleted_at
      )
    `,
    )
    .eq("media_assets.variant_kind", "banner")
    .eq("media_assets.approval_state", "approved")
    .is("media_assets.deleted_at", null);

  if (error) throw new Error(error.message);

  /** One banner per profile_code (lowest sort_order). */
  const best = new Map();
  for (const tp of data ?? []) {
    const ma = pickMedia(tp);
    if (!ma?.storage_path || !ma.bucket_id) continue;
    const code = tp.profile_code;
    const prev = best.get(code);
    const so = ma.sort_order ?? 0;
    if (!prev || so < (prev.ma.sort_order ?? 0)) best.set(code, { tp, ma });
  }
  return [...best.values()].map(({ tp, ma }) => ({ tp, ma, role: "banner" }));
}

async function main() {
  const { dryRun, allProfiles, limit, offset, kind, delayMsOverride } = parseArgs(
    process.argv.slice(2),
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const imageModel = (process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3").trim();
  const provider = resolveProvider(process.env.IMAGE_GEN_PROVIDER, openaiKey);

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use web/.env.local or export in shell).",
    );
    process.exit(1);
  }
  if (provider === "openai" && !openaiKey && !dryRun) {
    console.error(
      "IMAGE_GEN_PROVIDER=openai requires OPENAI_API_KEY. Or use IMAGE_GEN_PROVIDER=picsum (stock) or pollinations.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  let targets = [];
  try {
    if (kind === "card" || kind === "both") {
      targets.push(...(await fetchCardRows(supabase)));
    }
    if (kind === "banner" || kind === "both") {
      targets.push(...(await fetchBannerRows(supabase)));
    }
    if (kind === "gallery") {
      targets.push(...(await fetchGalleryRows(supabase)));
    }
  } catch (e) {
    console.error("Query failed:", e?.message ?? e);
    process.exit(1);
  }

  if (!allProfiles) {
    targets = targets.filter((r) => DEMO_PROFILE_CODE.test(r.tp.profile_code ?? ""));
  }

  targets.sort((a, b) => {
    const c = (a.tp.profile_code ?? "").localeCompare(b.tp.profile_code ?? "");
    if (c !== 0) return c;
    const order = { card: 0, banner: 1, gallery: 2 };
    const r = (order[a.role] ?? 9) - (order[b.role] ?? 9);
    if (r !== 0) return r;
    return (a.ma.sort_order ?? 0) - (b.ma.sort_order ?? 0);
  });

  const end = limit === Infinity ? undefined : offset + limit;
  targets = targets.slice(offset, end);

  if (targets.length === 0) {
    console.log("No matching media rows for this kind/offset/limit. Check seed, --all, or approvals.");
    process.exit(0);
  }

  const interDelayMs =
    delayMsOverride !== null
      ? delayMsOverride
      : provider === "pollinations"
        ? defaultPollinationsInterRequestMs()
        : provider === "picsum"
          ? defaultPicsumInterRequestMs()
          : 1200;

  console.log(
    `Found ${targets.length} target(s)${dryRun ? " (dry run)" : ""} [provider: ${provider}, kind: ${kind}, offset: ${offset}, delay: ${interDelayMs}ms].`,
  );
  if (provider === "picsum" && !dryRun) {
    console.log("(picsum = deterministic stock photos from picsum.photos, not AI portraits.)");
  }

  let i = 0;
  for (const row of targets) {
    i += 1;
    const { tp, ma, role } = row;
    const code = tp.profile_code;
    const prompt =
      role === "banner"
        ? buildBannerPrompt(tp)
        : role === "gallery"
          ? buildGalleryPrompt(tp)
          : buildCardPrompt(tp);
    const seed = seedFromProfileCode(code, `${role}-${ma.sort_order ?? 0}`);
    const outW =
      role === "banner" ? BANNER_WIDTH : role === "gallery" ? GALLERY_WIDTH : CARD_WIDTH;
    const outH =
      role === "banner" ? BANNER_HEIGHT : role === "gallery" ? GALLERY_HEIGHT : CARD_HEIGHT;

    console.log(`\n[${i}/${targets.length}] ${code} ${role} → ${ma.storage_path}`);

    if (dryRun) {
      console.log("  prompt preview:", prompt.slice(0, 120) + "…");
      continue;
    }

    let raw;
    try {
      raw = await generateRawImageBuffer(
        provider,
        prompt,
        seed,
        openai,
        imageModel,
        role,
        code,
      );
    } catch (e) {
      console.error("  Generate error:", e?.message ?? e);
      process.exit(1);
    }

    const jpeg = await sharp(raw)
      .resize(outW, outH, { fit: "cover", position: "attention" })
      .jpeg({ quality: role === "banner" ? 85 : role === "gallery" ? 86 : 88, mozjpeg: true })
      .toBuffer();

    const { error: upErr } = await supabase.storage
      .from(ma.bucket_id)
      .upload(ma.storage_path, jpeg, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (upErr) {
      console.error("  Upload failed:", upErr.message);
      process.exit(1);
    }

    console.log("  Uploaded OK.");

    if (i < targets.length) await sleep(interDelayMs);
  }

  console.log("\nDone. Hard-refresh the profile / directory if images look cached.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
