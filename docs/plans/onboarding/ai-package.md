# The AI package behind a signup (Phase 9, 2026-09-17)

One principle decides everything: **a site is stunning because it is specific.** A grill in Cancún and a nail salon in Tulum must not share a headline, a hero photo, a palette or a section order. The bake-off (`web/scripts/onboarding-qa/ai-bakeoff.mts`) showed the failure exactly: the cheap models wrote "Hecho con cariño, para ti" for all three fixtures. The package is built around specificity gates; the model per stage follows from what the stage needs.

## Pipeline

| # | Stage | Produces | Model | Cost | Time |
|---|---|---|---|---|---|
| 1 | Listen | text from voice | OpenAI transcribe | $0.003/min | 1–2 s |
| 2 | Understand | facts with provenance and confidence, type, visual direction, tone, audience, the person's phrases verbatim | **Haiku 4.5** (routed) | $0.004 | 3 s |
| 2b | Normalize | hours → one shape, phone → E.164 when the country is known, service lists tidy | none (`lib/tulala/normalize-facts.ts`) | 0 | 0 |
| 3 | Direct | Look from type + direction; palette from logo or direction; section plan | none (matrix owned by the Creative Director) | 0 | 0 |
| 4 | Write | every copy slot in both languages, page title, meta description | **Sonnet 5** (routed), one call | $0.02 | 10–13 s |
| 5 | Picture | hero medium now, 3 supporting low, rest after arrival; the owner's photos always win | OpenAI gpt-image (lead's engine, #1994) | $0.14 | off the critical path |
| 6 | Provision | tenant, domain hold, owner role, site rows | none | 0 | 4–6 s |
| 7 | Critic | headline bank (deterministic) then a judge for invented facts, wrong language, generic lines; one retry | **Haiku 4.5** (routed) | $0.002 | 2 s |
| 8 | Arrive | site or profile, wordmark typeset, "photos being made" on pending slots | none | | |
| 9 | Grow | write / rewrite / expand / shorten / tone on the bio (first surface), SEO-aware, 30/day cap | Sonnet for first write, **Haiku** for edits | $0.001–0.005 | 2–4 s |
| 10 | Mark | AI logo, third try behind the trial door | OpenAI gpt-image | $0.32/try | 20 s |

Per signup: business ≈ $0.17 (text $0.03, images $0.14); talent ≈ $0.01. Arrival 20–25 s for a business, 6–8 s for a talent; images never waited on.

## Bake-off, 2026-09-17 (5 extraction cases EN/ES, 3 copy cases)

Extraction: Haiku 4.5 recall 0.70 in 2.9 s at $0.0037; Sonnet 5 0.44 in 5.4 s at $0.0058 (echoes Spanish free text where Haiku normalizes); GPT-4.1 / 4.1-mini / 4o-mini 0.36 in 2 s at $0.0003 (drop "home visits", turn hours into day lists). Copy: Sonnet 5 wrote "Sabor que se comparte" and "Pretty hands, pretty feet"; Haiku wrote plainer but specific lines in 2.5 s at $0.0026; every OpenAI model wrote "Hecho con cariño, para ti" for all three businesses. The script's standing check flags a model whose headlines are not distinct across the three fixtures as unfit for the writing call.

## Routing

Four selects in Platform Admin → Operations (`ai_route_extraction`, `ai_route_copy`, `ai_route_critic`, `ai_route_helper`), read per request by `lib/ai/call-routing.server.ts`; "auto" keeps the global provider. A routed model whose key is missing falls back to the global provider and logs once. Recommended values are in `AI_ROUTE_RECOMMENDED`.

## Gates that make it specific

1. Headline bank: no site ships a headline another composed site carries (last 500, ≥ 0.8 word overlap) or one from the generic list.
2. Truth: nothing in copy, title, description or bio that is not in the facts (screeners + the critic).
3. Direction from words: "luxury", "family", "on the beach" change palette, type, imagery brief and section order (the lead's engine v3 + Looks v2).
4. Imagery of the right thing: only stated facts; a restaurant with no cuisine gets cuisine-neutral images.
5. Palette from the logo when there is one; wordmark typeset in the Look's face when there isn't.

## Loading

The person is never shown a still screen: the reading step (3 s) and the building step (7–28 s by path) show a paced progress bar, a step list with a ring on the current step, and a rotating line of what is being made (`components/onboarding/ui.tsx`: `LoadingSteps`, `ProgressBar`, `WhileYouWait`). The bio helper shows a ring over the text while a draft is written.

## Cap

Platform AI cap is $25/month with hard stop. At ≈ $0.17 per business signup that stops the module after ~150 signups; raise it, or set it per feature, before marketing.
