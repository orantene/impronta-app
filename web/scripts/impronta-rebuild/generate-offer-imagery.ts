/**
 * generate-offer-imagery.ts — AI imagery for the experiences / show pages.
 *
 * WHY. The Impronta media library is studio portraiture of represented talent
 * (1,900+ assets) and nothing else: no studio-at-work frames, no stage, no
 * makeup station. The experiences page and the show page need exactly those
 * pictures, and the owner's rule is "real photos, no dead placeholders". Until
 * the studio shoots its own frames (the show video is being recorded 2026-09-21),
 * these generated images stand in — filed into the tenant's Lifestyle folder so
 * Alejandra's team can replace them from the media library without touching
 * the builder tree, and every one is pinned in `image-slots.json` so the
 * seeder resolves the same asset each run.
 *
 * Prompts are hardened the same way the in-app generator hardens them (no real
 * person, no text, no logos, no nudity). Faces are avoided or de-emphasised so
 * nothing reads as a specific model.
 *
 * USAGE (from web/):
 *   npx tsx scripts/impronta-rebuild/generate-offer-imagery.ts            # dry run: prints the plan
 *   npx tsx scripts/impronta-rebuild/generate-offer-imagery.ts --apply    # generate + upload + pin
 *   ... --only=experiences-hero,show-hero                                  # subset
 *
 * Requires OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Idempotent per slot: a slot already pinned in image-slots.json is skipped
 * unless --force is passed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { uploadGeneratedImageBytes } from "@/lib/ai/ai-image-generation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dall-e-3 was retired from the API; gpt-image-1.5 is the current default here.
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5";
const PINS_PATH = path.join(__dirname, "image-slots.json");

type Size = "1024x1024" | "1536x1024" | "1024x1536";

interface Slot {
  slot: string;
  size: Size;
  subject: string;
  alt: string;
}

const MOOD =
  "High-end editorial photograph for a boutique model and talent agency on the Riviera Maya. " +
  "Warm natural light, dark elegant tones with gold accents, luxury fashion-magazine mood, tasteful, cinematic. " +
  "Fully clothed, elegant wardrobe. No text, no logos, no watermarks, no brand names. No recognizable real person or celebrity; faces turned away, in profile, soft focus or out of frame.";

export const OFFER_IMAGE_SLOTS: readonly Slot[] = [
  {
    slot: "experiences-hero",
    size: "1536x1024",
    subject:
      "A photo studio session in progress: a model on a white cyclorama seen from behind the photographer, softbox light, a stylist adjusting a garment, camera in the foreground. Wide cinematic frame.",
    alt: "A photo session in progress at the Impronta studio, seen from behind the photographer.",
  },
  {
    slot: "exp-model-for-a-day",
    size: "1024x1024",
    subject:
      "A photography workshop day at a studio: a coach gesturing to guide a stance, a small group in casual elegant clothes watching, a garment rack and a camera on a tripod, seen from behind the group.",
    alt: "A posing coach directing a small group during a studio experience.",
  },
  {
    slot: "exp-posing-course",
    size: "1024x1024",
    subject:
      "A dance-studio style room with a large mirror and warm wooden floor: a workshop instructor in an elegant black outfit demonstrating an editorial standing posture, two participants watching from behind, natural window light.",
    alt: "An instructor demonstrating a pose in front of a studio mirror.",
  },
  {
    slot: "exp-self-makeup",
    size: "1024x1024",
    subject:
      "A makeup station close-up: brushes, palettes and a ring light on a vanity, a hand holding a brush, out-of-focus studio behind. No full face visible.",
    alt: "Brushes and palettes at a makeup station under a ring light.",
  },
  {
    slot: "exp-session-studio",
    size: "1024x1024",
    subject:
      "A clean studio photo session: seamless backdrop, a single softbox, a photographer crouching with a camera, the subject in silhouette or from behind.",
    alt: "A photographer at work on a seamless studio backdrop.",
  },
  {
    slot: "exp-session-makeup",
    size: "1024x1024",
    subject:
      "A makeup artist working on a client before a studio shoot, seen over the artist's shoulder, brushes in hand, the client's face soft and out of focus.",
    alt: "A makeup artist preparing a client before a studio session.",
  },
  {
    slot: "exp-session-complete",
    size: "1024x1024",
    subject:
      "Full production styling at a studio: a rack of garments, a hair stylist's tools, a mirror with lights, a stylist steaming a dress, no faces.",
    alt: "Wardrobe, hair tools and a lit mirror ready for a complete studio session.",
  },
  {
    slot: "exp-session-vintage",
    size: "1024x1024",
    subject:
      "A period-styled photo set: 1950s vintage props, an old telephone, velvet chair, sepia tones, a figure in a vintage dress from behind, cinematic grain.",
    alt: "A vintage-era styled photo set with period props and sepia light.",
  },
  {
    slot: "show-hero",
    size: "1536x1024",
    subject:
      "A live stage show at a luxury beach resort at night: dancers in dramatic silhouette under gold and amber stage light, haze, an acrobat mid-air, an audience out of focus. Wide cinematic frame.",
    alt: "Dancers and an acrobat in silhouette under gold stage light at a resort show.",
  },
  {
    slot: "show-scenography",
    size: "1024x1024",
    subject:
      "Theatrical scenography detail: a hand-built stage set with draped fabric, warm spotlights and fog, no people.",
    alt: "A theatrical stage set under warm spotlights.",
  },
  {
    slot: "show-dancers",
    size: "1024x1024",
    subject:
      "A company of dancers rehearsing in costume, mid-movement, seen from the wings, faces turned away, dramatic side light.",
    alt: "Dancers in costume mid-movement during a rehearsal.",
  },
  {
    slot: "show-acrobats",
    size: "1024x1024",
    subject:
      "An aerial acrobat on silks high above a stage, in silhouette against gold light, dramatic and elegant.",
    alt: "An aerial acrobat on silks in silhouette against gold stage light.",
  },
];

interface Pins {
  tenantSlug?: string;
  pins: Record<string, string>;
}

async function openAiImage(prompt: string, size: Size, key: string): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size, quality: "high" }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const first = json.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first?.url) {
    const img = await fetch(first.url);
    if (!img.ok) throw new Error("download failed");
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("no image returned");
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim())) : null;

  const pins = JSON.parse(readFileSync(PINS_PATH, "utf8")) as Pins;
  const key = process.env.OPENAI_API_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || !url || !srk) throw new Error("OPENAI_API_KEY / SUPABASE env missing");
  const supabase = createClient(url, srk, { auth: { persistSession: false } });
  const { data: tenant } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", pins.tenantSlug ?? "impronta")
    .maybeSingle();
  if (!tenant) throw new Error("tenant not found");
  const tenantId = tenant.id as string;
  const { data: identity } = await supabase
    .from("agency_business_identity")
    .select("updated_by")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const userId = (identity?.updated_by as string | null) ?? "00000000-0000-0000-0000-000000000000";

  const failed: string[] = [];
  for (const s of OFFER_IMAGE_SLOTS) {
    if (only && !only.has(s.slot)) continue;
    if (pins.pins[s.slot] && !force) {
      console.log(`skip ${s.slot} (pinned ${pins.pins[s.slot]})`);
      continue;
    }
    const prompt = `${MOOD} Subject: "${s.subject}"`;
    if (!apply) {
      console.log(`[dry] ${s.slot} ${s.size}\n      ${s.subject}`);
      continue;
    }
    process.stdout.write(`generating ${s.slot} ${s.size} … `);
    let bytes: Buffer;
    try {
      bytes = await openAiImage(prompt, s.size, key);
    } catch (err) {
      // One rejected prompt must not sink the batch: report, keep going, and
      // the summary at the end names what still needs a picture.
      console.log(`FAILED: ${(err as Error).message.slice(0, 200)}`);
      failed.push(s.slot);
      continue;
    }
    const up = await uploadGeneratedImageBytes({ tenantId, userId, bytes, alt: s.alt });
    if (!up) throw new Error(`upload failed for ${s.slot}`);
    pins.pins[s.slot] = up.id;
    writeFileSync(PINS_PATH, JSON.stringify(pins, null, 2) + "\n");
    console.log(`ok → ${up.id}`);
  }
  if (failed.length) {
    console.log(`\nUNRESOLVED (rephrase and re-run with --only=): ${failed.join(", ")}`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
