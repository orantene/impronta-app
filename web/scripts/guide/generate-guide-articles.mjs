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
    .update(JSON.stringify({ purpose: entry.purpose, youCanHere: entry.youCanHere, faqs: entry.faqs ?? [], related: entry.relatedDrawers ?? [], category: entry.category ?? "" }))
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

function draftSystemPrompt(learnings) {
  const known = learnings.length
    ? ["", "Known mistakes previous drafts made on this product. Do not repeat them:", ...learnings.map((l) => `- ${l}`)]
    : [];
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
    ...known,
  ].join("\n");
}

function draftUserPrompt(nodeId, entry, locale, redraftNotes, sourceArticle) {
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
  if (sourceArticle) {
    lines.push(
      "",
      "VERIFIED ENGLISH ARTICLE. Write the Spanish version of THIS article: same meaning and structure, natural Mexican Spanish, rewrite the example for a Spanish-speaking reader rather than translating it word for word. You may not add any fact that is not in this article or the FACTS.",
      JSON.stringify(sourceArticle, null, 2),
    );
  }
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
    "Output ONLY a JSON object: { unsupportedSentences (array of the exact sentence strings you judged unsupported, copied verbatim from the draft), contradictionCount, structuralPass (boolean), notes (short string explaining any failure, or empty string if clean) }.",
  ].join("\n");
}

function criticUserPrompt(entry, nodeId, draft, sourceArticle) {
  const facts = { nodeId, purpose: entry.purpose, youCanHere: entry.youCanHere, faqs: entry.faqs ?? [], related: entry.relatedDrawers ?? [] };
  const parts = ["FACTS:", JSON.stringify(facts, null, 2)];
  if (sourceArticle) {
    parts.push("", "VERIFIED SOURCE ARTICLE (already fact-checked; the draft may restate anything in it):", JSON.stringify(sourceArticle, null, 2));
  }
  parts.push("", "DRAFT:", JSON.stringify(draft, null, 2));
  return parts.join("\n");
}

let CALLS = 0;

async function callClaude(apiKey, system, user) {
  CALLS += 1;
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
    whatItIsFor: "",
    steps: entry.youCanHere.map((text) => ({ text })),
    example: "",
    related: entry.relatedDrawers ?? [],
  };
}

const STRING_FIELDS = ["oneSentence", "whatItIsFor", "example", "whoSeesWhat", "careful"];

/** Remove the critic's unsupported sentences locally — no model call. */
/**
 * Returns { draft, matched, unmatched }. A flagged sentence the critic
 * paraphrased (so it matches nothing) is NOT silently dropped from the
 * list: the caller treats any unmatched flag as a hard fail, because
 * with no human reviewer "we could not find it to remove it" must never
 * become "published as checked".
 */
function stripSentences(draft, sentences) {
  const out = JSON.parse(JSON.stringify(draft));
  const norm = (x) => String(x ?? "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
  const needles = sentences.map(norm).filter((n) => n.length >= 8);
  const hit = new Set();
  const clean = (text) => {
    let t = norm(text);
    for (const needle of needles) {
      const bare = needle.replace(/[.!?]+$/, "");
      if (t.includes(bare)) {
        hit.add(needle);
        t = t.split(bare).join("");
      }
    }
    return t.replace(/\s{2,}/g, " ").replace(/^\s*[.,;:]\s*/, "").trim();
  };
  for (const f of STRING_FIELDS) if (out[f]) out[f] = clean(out[f]) || null;
  out.steps = (out.steps ?? []).map((st) => ({ ...st, text: clean(st.text) })).filter((st) => st.text);
  const unmatched = needles.filter((n) => !hit.has(n));
  return { draft: out, matched: hit.size, unmatched };
}

function structurallySound(draft) {
  return Boolean(draft.oneSentence) && Boolean(draft.whatItIsFor) && Boolean(draft.example) && (draft.steps ?? []).length > 0;
}

/**
 * Draft → critic → publish, spending as few calls as possible (owner ruling
 * 2026-09-17: credits are an engine, not a faucet):
 *   - unsupported sentences only  → strip locally, publish. 2 calls.
 *   - contradiction / structure   → one redraft with notes → critic. 4 calls.
 *   - still failing               → short version from facts. no extra call.
 * `sourceArticle` (ES only) is the verified EN article, so Spanish is derived
 * from something already checked instead of re-derived from raw facts.
 */
async function generateOne(apiKey, nodeId, entry, locale, learnings, sourceArticle) {
  const sys = draftSystemPrompt(learnings);
  let draft = await callClaude(apiKey, sys, draftUserPrompt(nodeId, entry, locale, null, sourceArticle));
  let critic = await callClaude(apiKey, criticSystemPrompt(), criticUserPrompt(entry, nodeId, draft, sourceArticle));

  const unsupported = (c) => (Array.isArray(c.unsupportedSentences) ? c.unsupportedSentences : []);
  const hardFail = (c) => (c.contradictionCount ?? 0) > 0 || c.structuralPass !== true;

  let stripped = 0;
  if (!hardFail(critic) && unsupported(critic).length > 0) {
    const res = stripSentences(draft, unsupported(critic));
    if (res.unmatched.length === 0 && structurallySound(res.draft)) {
      stripped = res.matched;
      draft = res.draft;
      critic = { ...critic, unsupportedSentences: [] };
    } else if (res.unmatched.length > 0) {
      critic = { ...critic, structuralPass: false, notes: `${critic.notes || ""} (could not locate flagged sentence(s) to strip: ${res.unmatched.map((u) => JSON.stringify(u.slice(0, 60))).join(", ")})`.trim() };
    } else {
      critic = { ...critic, structuralPass: false, notes: `${critic.notes || ""} (stripping left the article structurally incomplete)`.trim() };
    }
  }

  if (hardFail(critic)) {
    draft = await callClaude(apiKey, sys, draftUserPrompt(nodeId, entry, locale, critic.notes || "unspecified issue", sourceArticle));
    critic = await callClaude(apiKey, criticSystemPrompt(), criticUserPrompt(entry, nodeId, draft, sourceArticle));
    if (!hardFail(critic) && unsupported(critic).length > 0) {
      const res = stripSentences(draft, unsupported(critic));
      if (res.unmatched.length === 0 && structurallySound(res.draft)) {
        stripped = res.matched;
        draft = res.draft;
        critic = { ...critic, unsupportedSentences: [] };
      } else {
        critic = { ...critic, structuralPass: false };
      }
    }
  }

  const count = unsupported(critic).length;
  if (hardFail(critic) || count > 0) {
    return {
      status: "short-version",
      sections: shortVersionSections(entry),
      critic: { unsupportedCount: count, contradictionCount: critic.contradictionCount ?? null, structuralPass: critic.structuralPass ?? null, notes: critic.notes || "Second draft still failed verification; published the code-derived short version." },
    };
  }

  return {
    status: "ai-checked",
    sections: draft,
    critic: { unsupportedCount: 0, contradictionCount: critic.contradictionCount ?? 0, structuralPass: true, notes: stripped ? `${stripped} unsupported sentence(s) stripped before publish.` : critic.notes || "" },
  };
}

/**
 * The engine that grows: every critic verdict is stored in critic_notes, and
 * the most recent ones ride along in the next draft prompt as "known
 * mistakes". No model call to build it; it costs tokens, not calls, and it
 * pushes the first-pass rate up so redrafts (the expensive path) fall.
 */
async function loadLearnings(supabase) {
  const { data } = await supabase
    .from("guide_articles")
    .select("critic_notes")
    .neq("critic_notes", "")
    .not("critic_notes", "is", null)
    .order("critic_ran_at", { ascending: false })
    .limit(40);
  const seen = new Set();
  const out = [];
  for (const row of data ?? []) {
    const n = String(row.critic_notes).trim();
    if (!n || seen.has(n)) continue;
    if (/stripped before publish|Second draft still failed verification|structurally incomplete|could not locate flagged/.test(n)) continue;
    seen.add(n);
    out.push(n.slice(0, 220));
    if (out.length >= 15) break;
  }
  return out;
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
  const learnings = await loadLearnings(supabase);
  console.log(`[learnings] ${learnings.length} prior critic note(s) loaded into the draft prompt`);

  for (const nodeId of ids) {
    const entry = registry[nodeId];
    if (!entry) continue;
    const hash = sourceHashFor(entry);

    await supabase.from("guide_nodes").upsert(
      { id: nodeId, kind: "page", parent_id: null, label_key: null, since_release: null, source_hash: hash, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );

    let enSections = null; // the verified EN article, source for ES
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
          if (locale === "en" && existing.status === "ai-checked") {
            const { data: enRow } = await supabase.from("guide_articles").select("body_md").eq("node_id", nodeId).eq("locale", "en").maybeSingle();
            if (enRow?.body_md) { try { enSections = JSON.parse(enRow.body_md); } catch { enSections = null; } }
          }
          continue;
        }
      }

      console.log(`[draft] ${nodeId} (${locale}) ...`);

      // A single node's transient failure (a truncated/malformed model
      // response, a rate limit, a network blip) must not abort the whole
      // batch — earlier P0 runs died mid-way on exactly this and left the
      // remaining ~100 nodes unprocessed. One retry, then record and move on.
      const source = locale === "es" ? enSections : null;
      let result;
      try {
        result = await generateOne(apiKey, nodeId, entry, locale, learnings, source);
      } catch (err) {
        console.error(`  ! first attempt failed for ${nodeId} (${locale}): ${err.message} — retrying once`);
        try {
          result = await generateOne(apiKey, nodeId, entry, locale, learnings, source);
        } catch (err2) {
          console.error(`  ✗ giving up on ${nodeId} (${locale}): ${err2.message}`);
          failures.push({ nodeId, locale, error: err2.message });
          continue;
        }
      }

      if (result.status === "short-version") shortVersions += 1;
      generated += 1;
      if (locale === "en" && result.status === "ai-checked") enSections = result.sections;

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

  console.log(`\nDone. generated=${generated} skipped=${skipped} short-versions=${shortVersions} failures=${failures.length} api-calls=${CALLS} (${generated ? (CALLS / generated).toFixed(1) : "0"} per generated pair; skipped pairs cost 0)`);
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
