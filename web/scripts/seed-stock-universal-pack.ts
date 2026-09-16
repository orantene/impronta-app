/**
 * seed-stock-universal-pack.ts — day-one imagery for every business type.
 *
 * Files the platform's own marketing photographs (web/public/marketing/photos,
 * the same set the page-design templates already ship) into the lifestyle
 * stock library as the UNIVERSAL pack (family `custom`), one manifest row per
 * photo with a role picked from its aspect ratio. Per-family and per-type
 * packs added later outrank these automatically (platform-stock.ts).
 *
 *   npx tsx scripts/seed-stock-universal-pack.ts            dry run
 *   npx tsx scripts/seed-stock-universal-pack.ts --apply    upload + record
 *
 * Idempotent: a photo whose `metadata.seed_key` already exists is skipped.
 * Licence text records what is actually known about these files: they are
 * platform-owned marketing assets whose provenance is not recorded in the
 * repo (see docs/plans/templates/02-handoff.md, "owner must confirm").
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { storeStockImage } from "../src/lib/media/platform-stock-admin.server";
import { resolveStockTenantId } from "../src/lib/media/platform-stock";

const PHOTOS = resolve("public/marketing/photos");
const LICENCE = "platform-owned marketing asset; provenance not recorded in repo (owner to confirm)";

const ALT: Record<string, { es: string; en: string }> = {
  "talent-services-hero": { es: "Tres profesionales trabajando en un loft luminoso", en: "Three professionals at work in a bright loft" },
  "independent-singer-booking": { es: "Vocalista frente a un micrófono", en: "Vocalist at a microphone" },
  "service-pros-lifestyle": { es: "Profesionales de servicios a domicilio y bienestar", en: "Home-service and wellness professionals at work" },
  "agency-workspace-builder": { es: "Equipo revisando impresiones en un escritorio de estudio", en: "Team reviewing prints at a studio desk" },
  "hub-agency-discovery": { es: "Directora con tableta frente a un muro de inspiración", en: "Director with a tablet by a mood-board wall" },
  "mk-hero-business": { es: "Dueño de negocio en su local", en: "Business owner in their shop" },
  "mk-hero-perform": { es: "Artista en escena", en: "Performer on stage" },
  "mk-hero-service": { es: "Profesional de servicio atendiendo a una clienta", en: "Service professional with a client" },
  "mk-hosts-restaurant": { es: "Anfitriones en un restaurante", en: "Hosts at a restaurant" },
  "mk-models-party": { es: "Grupo en una celebración", en: "Group at a celebration" },
  "mk-models-runway": { es: "Pasarela de moda", en: "Fashion runway" },
  "mk-audience-business": { es: "Público de un negocio local", en: "Local business audience" },
  "mk-audience-hub": { es: "Personas en un espacio compartido", en: "People in a shared space" },
  "mk-audience-talent": { es: "Talento independiente en sesión", en: "Independent talent at a session" },
};

function roleFor(width: number, height: number, index: number): "hero" | "wide" | "portrait" | "gallery" | "team" | "detail" {
  const ratio = width / height;
  if (ratio < 0.95) return index % 2 === 0 ? "portrait" : "team";
  if (ratio > 1.7) return index % 2 === 0 ? "hero" : "wide";
  return index % 3 === 0 ? "detail" : "gallery";
}

async function main() {
  const { loadEnvLocal } = await import("./load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const tenantId = await resolveStockTenantId(sb);
  if (!tenantId) throw new Error("No tulala tenant.");

  const files = readdirSync(PHOTOS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  const { data: existing } = await sb.from("media_assets").select("metadata").eq("tenant_id", tenantId).contains("metadata", { source: "platform-stock" });
  const seeded = new Set(((existing ?? []) as Array<{ metadata: { seed_key?: string } | null }>).map((r) => r.metadata?.seed_key).filter(Boolean));

  let i = 0;
  for (const file of files) {
    const seedKey = `universal:${basename(file, extname(file))}`;
    const buf = readFileSync(join(PHOTOS, file));
    const meta = await sharp(buf).metadata();
    const role = roleFor(meta.width ?? 1, meta.height ?? 1, i);
    const alt = ALT[basename(file, extname(file))] ?? { es: basename(file, extname(file)).replace(/[-_]+/g, " "), en: basename(file, extname(file)).replace(/[-_]+/g, " ") };
    const skip = seeded.has(seedKey);
    console.log(`${skip ? "skip " : apply ? "seed " : "would"} ${file}  ${meta.width}x${meta.height}  ${(buf.length / 1024).toFixed(0)}KB → ${role}`);
    i += 1;
    if (skip || !apply) continue;
    const res = await storeStockImage(sb, {
      bytes: buf,
      manifest: { family: "custom", businessType: null, role, source: "licensed", licence: LICENCE, supplier: "Tulala marketing set (web/public/marketing/photos)", altEs: alt.es, altEn: alt.en, sortOrder: i },
      createdBy: null,
    });
    if (!res.ok) {
      console.error(`   FAILED: ${res.error}`);
      continue;
    }
    await sb.from("media_assets").update({ metadata: { source: "platform-stock", seed_key: seedKey, stock_category: "custom", stock_role: role } } as never).eq("id", res.assetId);
    console.log(`   ✓ ${res.id} (${Math.round(res.bytes / 1024)} KB)`);
  }
  if (!apply) console.log("\nDry run. Re-run with --apply to seed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
