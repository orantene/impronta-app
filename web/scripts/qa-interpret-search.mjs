#!/usr/bin/env node
/**
 * QA helper: POST /api/ai/interpret-search for each sample query.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/qa-interpret-search.mjs
 *
 * Requires: directory public, AI search enabled, Supabase + LLM configured.
 * Prints JSON summary: taxonomyTermIds count, location, heightMin/Max, query snippet.
 */
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const QUERIES = [
  { q: "woman", locale: "en" },
  { q: "177", locale: "en" },
  { q: "177 cm", locale: "en" },
  { q: "177 cm woman", locale: "en" },
  { q: "blond from ibiza", locale: "en" },
  { q: "blonde model cancun", locale: "en" },
  { q: "fitness male playa", locale: "en" },
  { q: "modelo rubia cancun", locale: "es" },
  { q: "mujer 177 cm", locale: "es" },
];

async function main() {
  for (const { q, locale } of QUERIES) {
    const url = `${BASE}/api/ai/interpret-search`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, locale }),
      });
    } catch (e) {
      console.error(`\n[${q}] fetch failed:`, e.message);
      continue;
    }
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      console.error(`\n[${q}] non-JSON (${res.status}):`, text.slice(0, 200));
      continue;
    }
    if (!res.ok) {
      console.error(`\n[${q}] HTTP ${res.status}:`, body);
      continue;
    }
    const tax = body.taxonomyTermIds ?? [];
    console.log(`\n--- ${q} (${locale}) ---`);
    console.log(
      JSON.stringify(
        {
          taxonomyCount: tax.length,
          locationSlug: body.locationSlug ?? "",
          heightMinCm: body.heightMinCm ?? null,
          heightMaxCm: body.heightMaxCm ?? null,
          query: (body.query ?? "").slice(0, 120),
          normalizedSummary: (body.normalizedSummary ?? "").slice(0, 120),
          usedInterpreter: body.usedInterpreter,
          interpretFailureCode: body.interpretFailureCode ?? null,
        },
        null,
        2,
      ),
    );
  }
}

main();
