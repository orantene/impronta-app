# Support Guide: how the knowledge gets made, translated, kept current, and read aloud

Companion to backlog item B-002 (support drawer, Guide tab, (i) icons, Helper mode).
Mockups: https://claude.ai/artifact/4YDZhEFTSqrqa3qL7XEZfB

## The one idea

The Guide is **generated from the product, not written next to it.** Every screen, heading, tab, chip and button that deserves an explanation carries a stable id in the code. Articles hang off those ids. When the code changes, the article is flagged, redrafted by AI, checked by a second AI, translated, voiced, and shipped with the release that changed it. Nothing in the Guide can describe a screen that no longer exists, because the Guide is built from the screens that do.

**Owner ruling 2026-09-17: no human reviewer, English or Spanish.** The owner has no time for review and there is no support lead for Spanish. AI writes, AI checks, AI publishes. Humans only see the result through the same feedback loop as every other user. Section 3b is how that stays safe.

What we already have and reuse:

| Asset in the repo | Role in this plan |
|---|---|
| `web/src/components/admin/shell/internal/help-registry.ts` (137 drawer entries: purpose, youCanHere, faqs, supportSlug) | Seed corpus and the id scheme |
| `web/src/lib/support/help-corpus.ts` (flattens the registry for the support AI) | Becomes a reader of the new corpus, so chatbot and Guide share one truth |
| `web/src/lib/translation/ai-translate-*.ts` + `web/src/i18n/glossary.json` | Spanish generation with protected brand terms |
| `web/src/lib/translation-center/*` (queue, review, health) | Not used for the Guide (no human lane); stays for tenant content |
| `web/src/lib/ai/openai-embeddings.ts` | Semantic search over articles |
| `guided-tour.tsx` (SVG spotlight tooltips pinned to DOM) | "Show me" playback from an article |
| Release Control (`docs/releases/<v>.md`, calendar versions) | The "What's new" feed and the version stamp on every article |
| `@anthropic-ai/sdk`, `openai` already installed | Drafting (Claude), TTS (OpenAI) |

## 1. Content model

```
GuideNode
  id            "messages" | "messages.offers-tab" | "messages.escrow-chip"  (stable, dotted path)
  kind          area | page | section | control
  parent        id
  surfaces      [{ route: "/w/messages", component: "workspace.tsx#ThreadHeader" }]
  labelKey      i18n key of the label users actually see
  since         "2026.09.1"          release that introduced it
  sourceHash    sha of the component + labels it describes (staleness)

GuideArticle (one per node per locale)
  locale        en | es
  status        draft | ai-checked | published | short-version
  critic        { unsupported, contradictions, structural: pass|fail, run }
  body          MDX in a FIXED schema (below)
  audio         { url, voice, textHash, durationSec }
  release       last release that touched it
  helpfulness   { yes, no, searches, opens }
```

Fixed article schema, every article, no exceptions:

1. **In one sentence** - what this thing is.
2. **What it is for** - the job it does for a barber, a chef, an agency.
3. **How to use it** - numbered steps with the real label names, each step deep-links to the screen ("Take me there").
4. **Example** - one concrete case (a hotel dinner, a brand shoot), 3 to 5 sentences.
5. **Who sees what** - client / talent / team visibility, every time it matters.
6. **Careful** - the one or two mistakes people make here.
7. **Inside this** - child nodes (rendered automatically from the tree).
8. **Related** - 2 or 3 jumps.

Page-level articles (kind = page) are the "parents" the (i) next to a heading opens. Control-level ones are what Helper mode lights up.

English is the source language. Spanish is derived, never written first, and never a literal translation: MX register, "tú", the glossary's protected terms untouched.

## 2. Where the ids come from (so the map builds itself)

- Components mark explainable things with `data-guide-id="messages.escrow-chip"`. Headings get it via `DashboardPageHeader`, tabs via `SegmentedNav`, chips via a tiny `Explain` wrapper.
- The 137 existing `DrawerId`s become nodes on day one (`kind: page`).
- **Helper mode is a runtime scan**: query `[data-guide-id]` in the current view, outline what has a published article, list the rest as "coming". No hand-maintained page-to-topic mapping, so it cannot drift.
- The (i) icon is the same thing at one node.

## 3. The pipeline: `guide-sync` on every merge to main

```
merge to main
  └─ A. scan       collect every data-guide-id + route + labelKey  → nodes.json
  └─ B. diff       new nodes without an article, nodes whose sourceHash changed
  └─ C. draft (AI) Claude drafts / redrafts EN in the schema, with the component source,
                   the PR description, sibling articles and the style guide as context
  └─ D. PR         opens "guide: <release>" PR, label guide-draft, one file per article
  └─ E. verify (AI) a SECOND model pass, different prompt, adversarial: checks every claim against the
                   component source and the i18n labels, scores the article (3b). Pass → auto-merge.
                   Fail → one redraft with the critic's notes → verify again → still failing = publish
                   as "short version" (sections 1, 2, 7, 8 only, which are derived from code) and open a
                   guide-gap issue. No human in the loop.
  └─ F. translate  Claude + glossary → ES, then the same verify pass in Spanish (label names, register,
                   protected terms). Status is `ai-checked`, never `machine`; the UI shows no
                   "traducción automática" note because every article went through the same check
  └─ G. build      MDX → JSON bundle per locale, embeddings, screenshots, audio → guide_articles table
  └─ H. release    docs/releases/<v>.md lists the changed articles; each article stamped "Updated in <v>"
```

### 3b. The AI review gate (replaces the human reviewer)

Two models, two jobs, never the same prompt:

| Pass | Model | What it does |
|---|---|---|
| Draft | claude-opus-5 | Writes the article from: component source, i18n labels (EN + ES), sibling articles, the PR description, the style guide, the schema |
| Verify | claude-opus-5, fresh context, critic prompt | Gets the article AND the same sources, must answer per sentence: *supported by source / not in source / contradicts source*. Also checks: every label named exists in i18n for that locale; every "Take me there" route exists; schema complete; example present; "who sees what" present; no forbidden words (buyer, cart, em dash); reading level |

Scoring is mechanical, not a vibe: `unsupported = 0`, `contradiction = 0`, all structural checks true → **publish**. One unsupported sentence → strip it and publish. Any contradiction → redraft once with the critic notes, then verify again. Second failure → publish the **short version** (the sections that are pure code facts: one sentence, what it is for, children, related) and log a gap. A short article that is true beats a long one that is wrong.

Extra guards because nobody reads it before users do:

- **Grounding rule in the draft prompt:** the model may only describe behavior it can point to in the source it was given. If a step is not visible in the code, it writes "check the screen" language, never invents.
- **Canary set:** 20 articles are also verified by a deterministic script (labels, routes, schema) every release. If the AI verifier and the script disagree on any of them, the run stops and opens an issue.
- **Users are the reviewers:** "Not really" on any article twice in 7 days → automatic redraft + verify. A search with no result 3 times → drafting queue. A ticket whose text matches an article → the critic re-reads that article with the ticket as evidence.
- **Everything is reversible:** each publish is a version; a one-line command rolls an article back; a bad release rolls the whole corpus back to the previous release stamp.
- **Owner sees only exceptions:** a weekly digest with the gap count, rollbacks, and the 5 worst "Not really" articles. No approvals, ever.

Gates that keep the Guide honest:

- **Static test, same pattern as the file-size ratchet:** every `data-guide-id` in the tree has a published EN and ES article, or is listed in `guide-allowlist.json` with a reason. Fails the PR otherwise. Both locales publish in the same run; there is no lag because there is no human queue.
- **PR template line:** `guide: updated | no-change (why)` for any PR touching `admin/shell`. The bot comments the list of nodes the PR touched.
- **Staleness hash:** article stores the hash of the component and labels it references. Hash changed → status `stale` → redraft. The drawer footer says "Checked against 2026.09.1".
- **Screenshots never drift:** a Playwright job renders each node's real screen with the control spotlighted, at each release, into the article. Old pictures are the number one way guides lie.

## 4. Spanish, specifically

- Glossary first: `src/i18n/glossary.json` holds the protected terms (Tulala, Escrow, Look, Sessions). Extend with every UI label so the article names the button exactly as the Spanish UI shows it. The translator reads `labelKey` and inserts the **live ES label**, it never translates the label itself.
- Spanish goes through the same verify pass as English, in Spanish, with two extra checks: every named label matches the live ES i18n string exactly, and the register is MX "tú" (the critic flags "usted", Spain vocabulary, and literal calques). Status `ai-checked`. The Translation Center queue is not used for the Guide; it stays for tenant content.
- Search is per locale with a fallback: an ES query with no ES hit searches EN and shows "Solo en inglés por ahora".
- Voice: one Spanish voice (MX), one English voice, chosen once; never mixed.

## 5. Listen (the play button)

- Audio is **pre-rendered at build**, never generated on click. Per article, per locale, keyed by `textHash`; regenerated only when the text changed. Stored in Supabase Storage, cached at the edge.
- Provider: **OpenAI TTS, decided by owner 2026-09-17** (`gpt-4o-mini-tts` class, SDK already installed). ElevenLabs is off the table unless the P1 listen test on 3 Spanish articles fails outright. Both return word timestamps, so the player highlights the sentence being read.
- Player: play button in the article header and one per section; 1x / 1.25x; remembers position per article. Fallback to the browser's `speechSynthesis` if the file is missing so the button never dies.
- Cost check: 137 pages + ~400 control articles × 2 locales × ~500 words ≈ 3.5M characters. At current TTS pricing that is tens of dollars for a full regen and cents per release delta.

## 6. AI on top, in order of value

1. **Ask the Guide** (P1): when search returns nothing useful, the same box answers in prose from the corpus with citations to articles. Uses the existing support engine and guardrails; answers only from the corpus, says "I don't know that one, want a ticket?" otherwise.
2. **Context-aware drawer** (P1): opens on the current page's node; "On this page" is the runtime scan.
3. **Show me** (P2): every "How to use it" step list can play as a guided tour using `GuidedTour`, spotlighting the real controls in order.
4. **Proactive help** (P2): the same error toast three times on one screen, or a search with no results, offers the matching article.
5. **Gap radar** (P2): weekly report from no-result searches, "Not really" votes and ticket text matched against nodes → drafting queue. The Guide grows where people actually get lost.
6. **Voice Q&A** (P3): hold the play button, ask, get a spoken answer from Ask the Guide.

## 7. Phases

| Phase | Ships | Gate to exit |
|---|---|---|
| **P0 · Foundation** (1 sprint) | Node ids on headings/tabs/chips of the top 10 pages; content model + `guide_articles` migration; draft + verify pipeline as a script; migrate 137 registry entries into EN + ES articles through it; Guide tab, (i), Helper mode reading from it; static test gate; canary script | Every page in the sidebar has an ai-checked EN and ES page article; Helper mode lights ≥ 5 controls on Messages; canary agrees with the verifier on 20/20 |
| **P1 · The loop** | `guide-sync` CI job (draft → verify → auto-merge); staleness hash; What's new from release notes; TTS build + player; Ask the Guide; feedback-triggered redrafts; weekly owner digest | One release goes out where the Guide updated itself end to end with zero human touches |
| **P2 · Quality** | Screenshot pipeline; Show me tours; gap radar; proactive help; ticket-evidence re-reads | "Not really" under 15% on the top 20 articles; short-version articles under 5% of the corpus |
| **P3 · Ahead** | Voice Q&A; per-workspace-type articles (a restaurant and a model agency read different examples); talent and client guides on the public side | Decided after P2 numbers |

## 8. Roles and rules

- **Owner** reads a weekly exception digest. No approvals. The voice choice is made by a listen test run by the engineer who ships P1; ElevenLabs is chosen only if OpenAI's MX Spanish is judged worse on 3 sample articles.
- **No human reviewer exists**, by ruling. The verify pass, the canary script, user feedback and rollback are the review.
- **Engineers** add `data-guide-id` when they add a control; the static test reminds them.
- **AI drafts, AI verifies, AI publishes.** A published sentence is one the critic could point to in the source.
- **No article without an example. No article without "who sees what".**
- Copy rules already in force apply: plain words, no em dashes, no "buyer"/"cart" for talent surfaces, USD only in examples.

## 9. Risks, stated

- AI drafts that are confidently wrong about behavior → the critic pass with per-sentence grounding, the short-version fallback, and rollback. The residual risk is a wrong sentence that the critic also believes; the canary set and user "Not really" votes are the net for that. This is the price of no reviewer and it is stated here so nobody is surprised.
- Spanish that reads like a translation → glossary + the critic's register check + the rule that examples are rewritten, not translated. Residual: MX idiom quality is whatever the model does; a native speaker's spot check is welcome but not required.
- Ids renamed in a refactor → the static test catches orphans; migration script maps old id → new id.
- Audio cost creep → hash-keyed regeneration only; per-release delta is small by construction.
