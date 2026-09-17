#!/usr/bin/env node
// ============================================================================
// voice-guide-articles.mjs — the "play" button's audio, pre-rendered at build
// ============================================================================
//
// Plan §5: audio is rendered ONCE per (article, locale, text hash) and stored
// in the public `guide-audio` bucket; the drawer streams the file. Nothing is
// synthesized on click, and unchanged text costs nothing on re-runs
// (owner ruling 2026-09-17: credits are an engine, not a faucet).
//
// Provider: OpenAI TTS (owner-decided). One voice per locale.
//
// Usage:
//   node --env-file=.env.local scripts/guide/voice-guide-articles.mjs [--nodes=a,b] [--limit=N] [--dry-run]
// Env: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const BUCKET = "guide-audio";
const MODEL = "gpt-4o-mini-tts";
const VOICE = { en: "alloy", es: "nova" };

function args() {
  const a = Object.fromEntries(process.argv.slice(2).map((s) => { const [k, v] = s.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  return { nodes: typeof a.nodes === "string" ? a.nodes.split(",").filter(Boolean) : null, limit: a.limit ? Number(a.limit) : Infinity, dryRun: Boolean(a["dry-run"]) };
}

/** The spoken script: title-less, sections in reading order, plain sentences. */
function scriptFor(sections, locale) {
  const parts = [sections.oneSentence, sections.whatItIsFor];
  const steps = (sections.steps ?? []).map((s) => s.text).filter(Boolean);
  if (steps.length) parts.push((locale === "es" ? "Cómo usarlo. " : "How to use it. ") + steps.map((t, i) => `${i + 1}. ${t}`).join(" "));
  if (sections.example) parts.push((locale === "es" ? "Ejemplo. " : "Example. ") + sections.example);
  if (sections.whoSeesWhat) parts.push((locale === "es" ? "Quién ve qué. " : "Who sees what. ") + sections.whoSeesWhat);
  if (sections.careful) parts.push((locale === "es" ? "Ojo. " : "Careful. ") + sections.careful);
  return parts.filter(Boolean).join("\n\n").trim();
}

async function synthesize(apiKey, text, locale) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, voice: VOICE[locale], input: text, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureBucket(supabase) {
  const { data } = await supabase.storage.listBuckets();
  if ((data ?? []).some((b) => b.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ["audio/mpeg"] });
  if (error) throw new Error(`createBucket: ${error.message}`);
  console.log(`[bucket] created ${BUCKET} (public)`);
}

async function main() {
  const { nodes, limit, dryRun } = args();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!apiKey || !url || !key) throw new Error("OPENAI_API_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  if (!dryRun) await ensureBucket(supabase);

  let q = supabase.from("guide_articles").select("id,node_id,locale,body_md,audio_text_hash").neq("status", "draft");
  if (nodes) q = q.in("node_id", nodes);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  let done = 0, skipped = 0, failed = 0, chars = 0;
  for (const row of rows) {
    if (done >= limit) break;
    let sections; try { sections = JSON.parse(row.body_md); } catch { continue; }
    const text = scriptFor(sections, row.locale);
    if (!text) continue;
    const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
    if (row.audio_text_hash === hash) { skipped += 1; continue; }
    if (dryRun) { console.log(`[dry] ${row.node_id} (${row.locale}) ${text.length} chars`); chars += text.length; done += 1; continue; }
    try {
      const mp3 = await synthesize(apiKey, text, row.locale);
      const path = `${row.node_id}/${row.locale}/${hash}.mp3`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: dbErr } = await supabase.from("guide_articles").update({ audio_url: pub.publicUrl, audio_voice: `${MODEL}/${VOICE[row.locale]}`, audio_text_hash: hash }).eq("id", row.id);
      if (dbErr) throw new Error(dbErr.message);
      chars += text.length; done += 1;
      console.log(`  ✓ ${row.node_id} (${row.locale}) ${text.length} chars`);
    } catch (err) {
      failed += 1; console.error(`  ✗ ${row.node_id} (${row.locale}): ${err.message}`);
    }
  }
  console.log(`\nDone. voiced=${done} skipped-unchanged=${skipped} failed=${failed} chars=${chars}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
