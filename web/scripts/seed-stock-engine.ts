/**
 * seed-stock-engine.ts — the Visual Asset Engine SEED (03 §2b, owner §9.1):
 * 5 heroes per active business type (one per visual direction) plus a
 * family-level set (2 per role per family) so no slot falls to the 14
 * unverified images. Nothing else per type; the rest is generated per site.
 *
 *   npx tsx --env-file=.env.local scripts/seed-stock-engine.ts                 plan + cost, no calls
 *   npx tsx --env-file=.env.local scripts/seed-stock-engine.ts --apply         generate what is missing
 *   npx tsx --env-file=.env.local scripts/seed-stock-engine.ts --apply --types nail-salon,spa
 *   npx tsx --env-file=.env.local scripts/seed-stock-engine.ts --apply --families-only
 *   npx tsx --env-file=.env.local scripts/seed-stock-engine.ts --apply --max-usd 8
 *
 * Resumable: a (type|family) × slot × direction that already has a
 * generated/qa_passed/approved row is skipped, so a rerun only fills gaps.
 * Sequential with a pause (the provider's rate limit tripped at 2 parallel
 * pairs); stops on not_configured / insufficient_quota / daily_cap and on the
 * --max-usd budget. Every image goes through the engine: layered prompt,
 * measured cost, automated QA, filed as qa_passed or rejected; heroes still
 * need a human in /platform/admin/stock/review before they serve.
 *
 * "Active types" = the 48 acceptance case types by default (scripts/
 * acceptance-cases.json); --all-types widens to the whole registry.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { resolveImageEngineSettings } from "../src/lib/ai/ai-image-model";
import { generateStockAsset } from "../src/lib/media/stock-engine.server";
import { DIRECTION_IDS, directionForIndex, type DirectionId } from "../src/lib/site-admin/builder-core/site-templates/stock-prompts";
import type { ImageSlotKey } from "../src/lib/site-admin/builder-core/site-templates/types";
import { BUSINESS_FAMILIES, BUSINESS_TYPES, type BusinessFamilyId } from "../src/lib/words/business-types";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = flag("--apply");
const MAX_USD = Number(opt("--max-usd") ?? "25");
const PAUSE_MS = 2_500;
const MEASURED_USD = 0.01086; // medium 1536×1024, 2026-09-16; squares cost less

const FAMILY_SLOTS: ReadonlyArray<ImageSlotKey> = ["hero", "wide", "portrait", "gallery-1", "gallery-2", "gallery-3", "gallery-4", "team", "detail"];

type Unit = { key: string; family: BusinessFamilyId; typeId: string | null; slot: ImageSlotKey; direction: DirectionId };

function activeTypeIds(): string[] {
  if (flag("--all-types")) return BUSINESS_TYPES.map((t) => t.id);
  const listed = opt("--types");
  if (listed) return listed.split(",").map((s) => s.trim()).filter(Boolean);
  const cases = JSON.parse(readFileSync(resolve(__dirname, "acceptance-cases.json"), "utf8")) as { cases: Array<{ type: string }> };
  return [...new Set(cases.cases.map((c) => c.type))];
}

function plan(): Unit[] {
  const units: Unit[] = [];
  if (!flag("--families-only")) {
    for (const id of activeTypeIds()) {
      const t = BUSINESS_TYPES.find((b) => b.id === id);
      if (!t) {
        console.warn(`unknown type ${id}, skipped`);
        continue;
      }
      for (const direction of DIRECTION_IDS) units.push({ key: `${t.id}|hero|${direction}`, family: t.family, typeId: t.id, slot: "hero", direction });
    }
  }
  if (!flag("--types") || flag("--families-only")) {
    for (const family of BUSINESS_FAMILIES) {
      for (const slot of FAMILY_SLOTS) {
        for (let i = 0; i < 2; i++) {
          const direction = directionForIndex(FAMILY_SLOTS.indexOf(slot) + i * 2);
          units.push({ key: `${family}|${slot}|${direction}`, family, typeId: null, slot, direction });
        }
      }
    }
  }
  return units;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (use --env-file)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const units = plan();
  const { data: existing, error } = await sb.from("platform_stock_images").select("business_type, family, slot, direction").in("approval", ["generated", "qa_passed", "approved"]).is("origin_tenant_id", null).limit(10000);
  if (error) throw new Error(error.message);
  const have = new Set((existing ?? []).map((r) => `${(r as { business_type: string | null }).business_type ?? (r as { family: string }).family}|${(r as { slot: string | null }).slot}|${(r as { direction: string | null }).direction}`));
  const missing = units.filter((u) => !have.has(u.key));
  const heroUnits = missing.filter((u) => u.typeId);
  const familyUnits = missing.filter((u) => !u.typeId);
  const est = missing.length * MEASURED_USD;
  console.log(`plan: ${units.length} units, ${units.length - missing.length} exist, ${missing.length} to generate (${heroUnits.length} type heroes, ${familyUnits.length} family)`);
  console.log(`estimate at measured medium price: $${est.toFixed(2)} sync (batch would be $${(est / 2).toFixed(2)}); budget --max-usd ${MAX_USD}`);
  if (!APPLY) {
    console.log("dry run; add --apply to generate");
    return;
  }

  const settings = await resolveImageEngineSettings();
  console.log(`model ${settings.model} · daily cap ${settings.dailyCap} · prices ${JSON.stringify(settings.prices)}`);
  let spent = 0, done = 0, passed = 0, rejected = 0, failed = 0;
  const started = Date.now();
  for (const u of [...heroUnits, ...familyUnits]) {
    if (spent >= MAX_USD) {
      console.log(`budget reached ($${spent.toFixed(2)}); stopping`);
      break;
    }
    const r = await generateStockAsset(sb as never, { family: u.family, typeId: u.typeId, slot: u.slot, direction: u.direction, quality: "medium", createdBy: null, settings });
    spent += r.costUsd;
    if (r.ok) {
      done += 1;
      if (r.approval === "qa_passed") passed += 1;
      else rejected += 1;
      const fails = Object.entries(r.qa as Record<string, { verdict: string; detail?: string }>).filter(([, c]) => c.verdict === "fail").map(([k, c]) => `${k}${c.detail ? `(${c.detail})` : ""}`);
      console.log(`${u.key}  ${r.approval}  $${r.costUsd.toFixed(4)}  ${r.latencyMs}ms${fails.length ? `  ${fails.join(",")}` : ""}`);
    } else {
      failed += 1;
      console.log(`${u.key}  ${r.code}  ${r.error.slice(0, 120)}`);
      if (r.code === "not_configured" || r.code === "insufficient_quota" || r.code === "daily_cap") break;
    }
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
  console.log(`done: ${done} generated (${passed} qa_passed, ${rejected} rejected), ${failed} failed, $${spent.toFixed(3)} in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
