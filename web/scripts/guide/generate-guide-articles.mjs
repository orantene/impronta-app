#!/usr/bin/env node
// ============================================================================
// generate-guide-articles.mjs — the guide-sync pipeline (draft → critic → publish)
// ============================================================================
//
// Implements plan §3 and §3b of docs/plans/support-guide-knowledge-plan-2026-09-17.md:
// no human reviewer. Every article is drafted by one model call and checked
// by a second, adversarial one before it is allowed to publish.
//
// P0 SCOPE NOTE: the plan's long-term design grounds the draft against real
// component source + live i18n labels. That instrumentation (data-guide-id
// scanning, per-node source extraction, labelKey resolution) is not built
// yet. For P0 the ground truth is the existing DRAWER_HELP registry entry
// for each node — 131 entries of hand-written, already-shipped product copy
// (purpose / youCanHere / faqs / category / relatedDrawers), plus a
// handful of ad-hoc nodes for the support drawer's own controls (see
// guide-registry.mjs). That is a
// genuinely reliable source to draft from; it is a narrower source than the
// full plan calls for, not a fabricated one. Swapping in real component
// source + live labels is a P1 item and does not change this script's shape
// (draft, critic, publish) — only what "the source" contains.
//
// Usage:
//   node --env-file=.env.local scripts/guide/generate-guide-articles.mjs --nodes=id1,id2,id3
//   node --env-file=.env.local scripts/guide/generate-guide-articles.mjs --all
//   node --env-file=.env.local scripts/guide/generate-guide-articles.mjs --all --limit=20
//
// Env required: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Idempotent: skips (node, locale) pairs whose stored source_hash already
// matches the current registry entry, unless --force is passed.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { loadRegistry } from "./guide-registry.mjs";

const MODEL = "claude-opus-5";

function args() {
  const a = Object.fromEntries(
    process.argv.slice(2).map((s) => {
      const [k, v] = s.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
  );
  return {
    all: Boolean(a.all),
    nodes: typeof a.nodes === "string" ? a.nodes.split(",").filter(Boolean) : [],
    limit: a.limit ? Number(a.limit) : Infinity,
    force: Boolean(a.force),
  };
}

function sourceHashFor(entry) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ purpose: entry.purpose, youCanHere: entry.youCanHere, faqs: entry.faqs ?? [] }))
    .digest("hex")
    .slice(0, 16);
}

const STYLE_RULES = [
  "Plain language, no jargon.",
  "Never use the words \"buyer\" or \"cart\" for talent-facing concepts.",
  "USD only in examples unless the node is explicitly about currency settings.",
  "No em dashes.",
  "Second person (\"you\"), addressed to the workspace owner/staff using the product.",
];

function draftSystemPrompt() {
  return [
    "You write help articles for Tulala, a website + booking platform for talent agencies, restaurants, salons and similar small businesses.",
    "You will be given the ONLY facts you may state: a short purpose sentence, a list of things the user can do here, optional FAQs, and related topic ids.",
    "Write a JSON object with these exact keys: oneSentence, whatItIsFor, steps (array of {text}), example, whoSeesWhat (string or null), careful (string or null), related (array of topic ids, copy from the given related ids, do not invent new ones).",
    "Rules:",
    "- Every claim must be traceable to the given facts. If the facts do not say who sees what, set whoSeesWhat to null. Never invent a workflow, a button label, or a number that was not given to you.",
    "- example: one concrete, plausible scenario for this kind of business (a restaurant dinner, a salon booking, a brand shoot), 3-5 sentences, consistent with the given facts only.",
    "- careful: at most one or two sentences on a mistake people make, only if it follows from the given facts; otherwise null.",
    ...STYLE_RULES.map((r) => `- ${r}`),
    "Output ONLY the JSON object, no prose before or after.",
  ].join("\n");
}

function draftUserPrompt(nodeId, entry, locale, redraftNotes) {
  const facts = {
    nodeId,
    purpose: entry.purpose,
    youCanHere: entry.youCanHere,
    faqs: entry.faqs ?? [],
    category: entry.category,
    related: entry.relatedDrawers ?? [],
  };
  const lines = [
    locale === "es"
      ? "Write the article in Spanish (Mexico), informal \"tú\" register. Do not write a literal translation of an English draft — write natural Mexican Spanish. Keep these terms in English exactly as given, never translate them: Impronta, Talent, Model, Agency, Profile, Directory, Availability, Verified, Apply, Book."
      : "Write the article in English.",
    "",
    "FACTS (the only source you may draw from):",
    JSON.stringify(facts, null, 2),
  ];
  if (redraftNotes) {
    lines.push("", "Your previous draft was rejected by a reviewer for these reasons — fix them:", redraftNotes);
  }
  return lines.join("\n");
}

function criticSystemPrompt() {
  return [
    "You are an adversarial fact-checker for a help article. You will be given the FACTS the writer was allowed to use, and the DRAFT they produced.",
    "For every sentence in the draft's oneSentence, whatItIsFor, each step's text, example, whoSeesWhat and careful fields, decide: supported (directly follows from the facts), unsupported (plausible-sounding but not stated in the facts), or contradiction (conflicts with the facts).",
    "Also check structure: oneSentence non-empty, whatItIsFor non-empty, at least 1 step, example non-empty and consistent with the facts, related contains only ids that were in the facts' related list, no forbidden words (buyer, cart, em dash character —).",
    "Output ONLY a JSON object: { unsupportedCount, contradictionCount, structuralPass (boolean), notes (short string explaining any failure, or empty string if clean) }.",
  ].join("\n");
}

function criticUserPrompt(entry, nodeId, draft) {
  const facts = { nodeId, purpose: entry.purpose, youCanHere: entry.youCanHere, faqs: entry.faqs ?? [], related: entry.relatedDrawers ?? [] };
  return ["FACTS:", JSON.stringify(facts, null, 2), "", "DRAFT:", JSON.stringify(draft, null, 2)].join("\n");
}

async function callClaude(apiKey, system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const block = json.content?.find((b) => b.type === "text");
  const text = block?.text?.trim() ?? "";
  const truncated = json.stop_reason === "max_tokens";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`No JSON in model response${truncated ? " (truncated at max_tokens)" : ""}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    throw new Error(
      `${err.message}${truncated ? " (response was truncated at max_tokens — this is very likely why)" : ""}`,
    );
  }
}

function shortVersionSections(entry) {
  return {
    oneSentence: entry.purpose,
    whatItIsFor: entry.youCanHere.join(" "),
    steps: entry.youCanHere.map((text) => ({ text })),
    example: "",
    related: entry.relatedDrawers ?? [],
  };
}

async function generateOne(apiKey, nodeId, entry, locale) {
  let draft = await callClaude(apiKey, draftSystemPrompt(), draftUserPrompt(nodeId, entry, locale, null));
  let critic = await callClaude(apiKey, criticSystemPrompt(), criticUserPrompt(entry, nodeId, draft));

  const failed = (c) => c.contradictionCount > 0 || c.unsupportedCount > 0 || c.structuralPass !== true;

  if (failed(critic)) {
    draft = await callClaude(apiKey, draftSystemPrompt(), draftUserPrompt(nodeId, entry, locale, critic.notes || "unspecified issue"));
    critic = await callClaude(apiKey, criticSystemPrompt(), criticUserPrompt(entry, nodeId, draft));
  }

  if (failed(critic)) {
    return {
      status: "short-version",
      sections: shortVersionSections(entry),
      critic: { unsupportedCount: critic.unsupportedCount, contradictionCount: critic.contradictionCount, structuralPass: critic.structuralPass, notes: critic.notes || "Second draft still failed verification; published the code-derived short version." },
    };
  }

  return {
    status: "ai-checked",
    sections: draft,
    critic: { unsupportedCount: critic.unsupportedCount, contradictionCount: critic.contradictionCount, structuralPass: critic.structuralPass, notes: critic.notes || "" },
  };
}

async function main() {
  const { all, nodes: nodeArgIds, limit, force } = args();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

  const registry = await loadRegistry();
  const allIds = Object.keys(registry);
  const ids = all ? allIds.slice(0, limit) : nodeArgIds.filter((id) => allIds.includes(id));
  if (ids.length === 0) {
    console.error("No matching node ids. Pass --nodes=id1,id2 or --all.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let generated = 0;
  let skipped = 0;
  let shortVersions = 0;
  const failures = [];

  for (const nodeId of ids) {
    const entry = registry[nodeId];
    if (!entry) continue;
    const hash = sourceHashFor(entry);

    await supabase.from("guide_nodes").upsert(
      { id: nodeId, kind: "page", parent_id: null, label_key: null, since_release: null, source_hash: hash, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

    for (const locale of ["en", "es"]) {
      if (!force) {
        const { data: existing } = await supabase
          .from("guide_articles")
          .select("source_hash, status")
          .eq("node_id", nodeId)
          .eq("locale", locale)
          .maybeSingle();
        if (existing && existing.source_hash === hash && existing.status !== "draft") {
          console.log(`[skip] ${nodeId} (${locale}) — unchanged`);
          skipped += 1;
          continue;
        }
      }

      console.log(`[draft] ${nodeId} (${locale}) ...`);

      // A single node's transient failure (a truncated/malformed model
      // response, a rate limit, a network blip) must not abort the whole
      // batch — earlier P0 runs died mid-way on exactly this and left the
      // remaining ~100 nodes unprocessed. One retry, then record and move on.
      let result;
      try {
        result = await generateOne(apiKey, nodeId, entry, locale);
      } catch (err) {
        console.error(`  ! first attempt failed for ${nodeId} (${locale}): ${err.message} — retrying once`);
        try {
          result = await generateOne(apiKey, nodeId, entry, locale);
        } catch (err2) {
          console.error(`  ✗ giving up on ${nodeId} (${locale}): ${err2.message}`);
          failures.push({ nodeId, locale, error: err2.message });
          continue;
        }
      }

      if (result.status === "short-version") shortVersions += 1;
      generated += 1;

      const { error } = await supabase.from("guide_articles").upsert(
        {
          node_id: nodeId,
          locale,
          status: result.status,
          body_md: JSON.stringify(result.sections),
          source_hash: hash,
          critic_unsupported_count: result.critic.unsupportedCount ?? null,
          critic_contradiction_count: result.critic.contradictionCount ?? null,
          critic_structural_pass: result.critic.structuralPass ?? null,
          critic_notes: result.critic.notes ?? null,
          critic_ran_at: new Date().toISOString(),
          release: null,
        },
        { onConflict: "node_id,locale" },
      );
      if (error) {
        console.error(`  ✗ write failed for ${nodeId} (${locale}): ${error.message}`);
        failures.push({ nodeId, locale, error: error.message });
      } else {
        console.log(`  ✓ ${result.status}${result.status === "short-version" ? " (fell back — see critic_notes)" : ""}`);
      }
    }
  }

  console.log(`\nDone. generated=${generated} skipped=${skipped} short-versions=${shortVersions} failures=${failures.length}`);
  if (failures.length > 0) {
    console.log("Failed (node, locale) pairs — rerun with --nodes=<comma-list> to retry just these:");
    for (const f of failures) console.log(`  - ${f.nodeId} (${f.locale}): ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
