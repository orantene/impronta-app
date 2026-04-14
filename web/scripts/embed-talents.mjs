/**
 * Backfill / refresh `public.talent_embeddings` from `talent_profiles.ai_search_document`.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * Run: node --env-file=.env.local scripts/embed-talents.mjs [--limit=N]
 *
 * Idempotent: skips rows whose document_hash already matches.
 *
 * DB triggers (see `supabase/migrations/20260416150000_embedding_invalidation_triggers.sql`) delete
 * stale `talent_embeddings` rows when `ai_search_document`, workflow, visibility, or taxonomy assignments
 * change — rerun this job or a cron to repopulate.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const MODEL = "text-embedding-3-small";
const VERSION = "v1";

function argLimit() {
  const raw = process.argv.find((a) => a.startsWith("--limit="));
  if (!raw) return 500;
  const n = Number(raw.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : 500;
}

async function embedOne(text) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = await res.json();
  const emb = json?.data?.[0]?.embedding;
  if (!Array.isArray(emb)) throw new Error("No embedding in response");
  return emb;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !skey) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const limit = argLimit();
  const supabase = createClient(url, skey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("talent_profiles")
    .select("id, ai_search_document")
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .not("ai_search_document", "is", null)
    .limit(limit);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let done = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const doc = row.ai_search_document?.trim();
    if (!doc) {
      skipped++;
      continue;
    }
    const hash = crypto.createHash("sha256").update(doc).digest("hex");

    const { data: existing } = await supabase
      .from("talent_embeddings")
      .select("document_hash")
      .eq("talent_profile_id", row.id)
      .maybeSingle();

    if (existing?.document_hash === hash) {
      skipped++;
      continue;
    }

    try {
      const embedding = await embedOne(doc);
      const { error: upErr } = await supabase.from("talent_embeddings").upsert(
        {
          talent_profile_id: row.id,
          embedding,
          embedding_model: MODEL,
          embedding_version: VERSION,
          document_hash: hash,
        },
        { onConflict: "talent_profile_id" },
      );
      if (upErr) {
        console.error("upsert", row.id, upErr.message);
        continue;
      }
      done++;
      process.stdout.write(".");
    } catch (e) {
      console.error("\n", row.id, e.message);
    }
  }

  console.log(`\nEmbedded ${done}, skipped ${skipped}, scanned ${(rows ?? []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
