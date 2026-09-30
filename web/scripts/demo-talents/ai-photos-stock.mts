/**
 * Register the AI demo photos (ai-photos.mts output) as tulala.digital platform
 * stock, through the product's own write path `storeStockImage`
 * (platform-stock-admin.server.ts): bytes copied into the `tulala` stock tenant
 * under tenant/<stock>/stock/<uuid>.jpg, filed into the Stock system folder, one
 * `platform_stock_images` manifest row per image.
 *
 * - Prompt and alts are stored WITHOUT the demo's personal name.
 * - approval: `generated` (default) until the contact-sheet review passes;
 *   `--approval qa_passed` promotes rows of reviewed demos (never `approved`,
 *   which is a human's word in the stock engine).
 * - Idempotent: each row carries tags.demo_key = "<code>/<slot>-<hash>"; an
 *   existing key is skipped (or has its approval raised with --approval).
 * - Demo-only: codes TAL-931xx..933xx only.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs npx tsx --tsconfig scripts/demo-talents/tsconfig.json \
 *     --env-file=.env.local scripts/demo-talents/ai-photos-stock.mts --only TAL-93103,... [--approval qa_passed] [--yes-write]
 * Without --yes-write it prints what it would register.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storeStockImage } from "../../src/lib/media/platform-stock-admin.server";
import { resolveStockTenantId, type StockApproval, type StockRole } from "../../src/lib/media/platform-stock";
import type { ImageMeta } from "./ai-photos.mts";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const WRITE = args.includes("--yes-write");
// --only TAL-a,TAL-b or --only @codes.txt (comma/newline separated)
const onlyArg = opt("--only") ?? "";
const ONLY = (onlyArg.startsWith("@") ? fs.readFileSync(onlyArg.slice(1), "utf8") : onlyArg).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
if (!ONLY.length) throw new Error("--only <codes> is required");
const APPROVAL = (opt("--approval") ?? "generated") as StockApproval;
if (!["generated", "qa_passed"].includes(APPROVAL)) throw new Error("--approval must be generated or qa_passed");
const OUT = opt("--out") ?? path.join(os.homedir(), "Desktop/tulala-exports/demo-foundation/photos");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Owner's trade → stock family map (platform_stock_images_family_check). */
export function familyFor(slug: string): string {
  const s = slug.toLowerCase();
  const rules: [RegExp, string][] = [
    [/nail|lash|brow|makeup|hair|barber|wax|thread|beauty|esthetic|skin|facial|braid|tattoo-remov/, "beauty"],
    [/massage|spa|yoga|pilates|medit|reiki|wellness|doula|acupunct/, "wellness"],
    [/trainer|coach|fitness|boxing|swim|running|crossfit/, "fitness"],
    [/photograph|dj|planner|event|wedding|florist|decor|host|mc|stage|brand-ambassador|video|singer|band|music/, "events"],
    [/chef|cook|catering|baker|pastry|bartender|sommelier|cake|barista/, "dining"],
    [/lawyer|attorney|account|consult|notary|immigration|tax|seo|marketing|lawyer|paperwork|bookkeep/, "professional"],
    [/tutor|teacher|lesson|instructor|language/, "education"],
    [/concierge|housekeep|cleaner|hospitality|butler/, "hospitality"],
    [/craft|tattoo|tailor|dressmak|leather|ceramic|embroider|jewel|silver|carpent|woodwork/, "craft"],
    [/guide|tour|hiking|birdwatch/, "tours"],
  ];
  return rules.find(([re]) => re.test(s))?.[1] ?? "custom";
}

function roleFor(m: ImageMeta): StockRole {
  if (m.variant === "card") return "portrait";
  if (m.variant === "hero") return m.size === "1536x1024" ? "hero" : "wide";
  if (m.service != null || /detail|inset/i.test(m.hint)) return "detail";
  if (m.size === "1536x1024") return "wide";
  return "gallery";
}

function scrub(text: string, names: string[], neutral: string): string {
  let out = text;
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s)?\\b`, "gi");
    out = out.replace(re, (_m, poss) => (poss ? `${neutral}'s` : neutral));
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const pack = JSON.parse(fs.readFileSync(path.join(OUT, "pack.json"), "utf8")) as Record<string, { photos: { file: string }[] }>;
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "..", "manifest-foundation.json"), "utf8")) as { entries?: Record<string, unknown> };
const stockTenant = await resolveStockTenantId(admin);
if (!stockTenant) throw new Error("stock tenant (slug tulala) not found");

let registered = 0, skipped = 0, promoted = 0, retired = 0;
for (const code of ONLY) {
  if (!/^TAL-93[123]\d{2}$/.test(code)) throw new Error(`REFUSE: ${code} is not a TAL-931xx..933xx demo code`);
  if (!manifest.entries?.[code]) throw new Error(`REFUSE: ${code} is not in manifest-foundation.json`);
  const dir = path.join(OUT, code);
  if (!fs.existsSync(dir)) { console.log(`${code}: no photos dir`); continue; }
  // The pack is the source of truth: only the current set, never superseded files.
  const packPhotos = pack[code]?.photos ?? [];
  if (!packPhotos.length) { console.log(`${code}: not in pack.json`); continue; }
  if (packPhotos.some((p) => !fs.existsSync(p.file) || !fs.existsSync(`${p.file}.json`))) {
    console.log(`${code}: set is being regenerated, skipped for now`);
    continue;
  }
  const metas = packPhotos.map((p) => JSON.parse(fs.readFileSync(`${p.file}.json`, "utf8")) as ImageMeta);
  for (const [i, m] of metas.entries()) {
    const { data: existing } = await admin.from("platform_stock_images").select("id, approval").contains("tags", { demo_key: m.key }).maybeSingle();
    if (existing) {
      if (APPROVAL === "qa_passed" && (existing as { approval: string }).approval === "generated") {
        if (WRITE) await admin.from("platform_stock_images").update({ approval: "qa_passed", reviewed_at: new Date().toISOString(), review_note: "demo contact-sheet review" } as never).eq("id", (existing as { id: string }).id);
        promoted++;
      } else skipped++;
      continue;
    }
    const family = familyFor(m.taxonomy_slug);
    const role = roleFor(m);
    const prompt = scrub(m.prompt, m.names, "the professional");
    const altEn = scrub(m.alt_en, m.names, "the professional");
    const altEs = scrub(m.alt_es, m.names, "la persona profesional");
    if (!WRITE) {
      console.log(`would register ${m.key} family=${family} type=${m.taxonomy_slug} role=${role} approval=${APPROVAL}\n  alt_en: ${altEn}`);
      continue;
    }
    const r = await storeStockImage(admin, {
      bytes: fs.readFileSync(path.join(dir, `${path.basename(m.key)}.jpg`)),
      createdBy: null,
      manifest: {
        family, businessType: m.taxonomy_slug, role, source: "generated", licence: "tulala-generated-owned", supplier: m.model, prompt,
        altEs, altEn, sortOrder: i, approval: APPROVAL, provenance: "generated",
        tags: { demo_key: m.key, origin: "demo-foundation", slot: m.slot },
        model: m.model, modelSize: m.size, modelQuality: m.quality, promptVersion: "demo-ai-photos-v1", measuredCostUsd: m.cost_usd,
      },
    });
    if (!r.ok) throw new Error(`${m.key}: ${r.error}`);
    registered++;
  }
  // A regenerated shot supersedes its old image: soft-retire stock rows no longer in the pack
  // (retired_at only; the object stays, per the stock library's retire rule).
  const keep = new Set(metas.map((m) => m.key));
  const { data: rows } = await admin.from("platform_stock_images").select("id, tags").like("tags->>demo_key", `${code}/%`).is("retired_at", null);
  const stale = ((rows ?? []) as { id: string; tags: { demo_key?: string } }[]).filter((r) => !keep.has(r.tags.demo_key ?? ""));
  if (stale.length && WRITE) {
    await admin.from("platform_stock_images").update({ retired_at: new Date().toISOString() } as never).in("id", stale.map((r) => r.id));
  }
  retired += stale.length;
  console.log(`${code}: ${metas.length} images, ${stale.length} superseded`);
}
console.log(`${WRITE ? "" : "DRY RUN: "}registered ${registered}, skipped ${skipped}, promoted ${promoted}, retired ${retired}`);
