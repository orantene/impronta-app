# Onboarding · owner's phone run 2026-09-17 and the fixes (P10)

**What happened on the phone (production, 19:10–19:43Z):** the guest run died on "Reading your words" three times. Root cause: the Anthropic account had no credit (`invalid_request_error: credit balance is too low`), surfaced by the adapter as `api_error`. Two defects made it worse: no provider failover, and no ceiling on the reading screen. After the owner topped up, the run reached the understood card in 3 s (Haiku) and then looped between the card and the "basics" question: free-text fields, "what you do" asked although known, city not validated, skip allowed on required fields.

**Fixes in this PR**
- Extraction: retry once, then fail over to the other provider when it has a key; every attempt writes a `cms_ai_usage_log` row (`onboarding_extraction`, cost, latency, ok, attempt).
- Reading screen: 45 s ceiling and a catch; past it the short-form card takes over with "We couldn't read that".
- Basics question rebuilt: what you do = search-and-pick over the talent taxonomy / business-type catalogue (word-level match: "nail tech" → Nail Artist), pre-selected from what the AI read, "Other" only under the list with a note; city = search-and-pick over the platform's curated cities with Google behind them; both required; no skip.

**Clicked on the isolated stack (mobile-onboarding project, 375 px):** screenshots in this folder. `understood.spec.ts` + `account.spec.ts`: 6/6 after the link assertion learned the taken-then-alternative path (a stale fixture tenant on the branch).

**Stored on pick:** `module_state.typeChoice = { kind: "talent", id, slug: "nail-artist" }`, facts `work.discipline = "Nail Artist"`, `person.city = "Playa Del Carmen"`, `person.country = "MX"` (all user_stated / confirmed).

**Not done here:** services as pick-from-catalogue (still free text, pre-filled from the AI); city search outside Mexico (Google predictions are MX-scoped for now).
