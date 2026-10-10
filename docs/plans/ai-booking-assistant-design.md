# TUL-36 — AI booking assistant in chat: design

**Status: DESIGN. Not built. Feature code waits for PM (Oran) approval of this doc.**  
Card: [TUL-36](https://app.notion.com/p/3ef2c5ee9743814598def4d3cc532ee6) · Project G · Size L · Milestone: Front chat engine  
Written 2026-10-08 from `origin/main` research. Claims about existing code name files; proposals are marked as such.

Acceptance rows this design covers (S8 / Done checklist): **#38** book with AI, **#39** AI pay link + PAID after webhook, **#40** no invent + handoff when unsure, **#41** talent see/override, **#43** per-talent on/off. **#42 MCP booking stays paused** (owner go required; out of scope here).

---

## 0. Product one-liner

A guest on any talent or agency public site can chat in the **existing front-door dock** and get: real service / price / duration answers; a booked slot or a payment link; or a clean handoff to the talent. Templates only **skin** the dock. They must never drop these functions. Talent can turn the assistant off and override anything it did.

---

## 1. What exists today (verified)

| Piece | Path | State |
|---|---|---|
| One front-door dock engine | `web/src/app/t/[profileCode]/_chat/*` (`MiniChatPanelColumn`, `TalentProfileChatLauncher`, `GuestDock*`) | LIVE. Canonical engine (`docs/plans/front-chat/00-inventory.md`) |
| Theme = skin only | `chat.variant` via `lib/talent-site/chat-card.ts` + `card-dock-skin.ts` | LIVE. Maison = card; Folio/Gridline = standard. No second chat |
| Instant price/duration (no LLM) | `guest-instant-answer.ts` → `use-mini-chat-send.ts` | LIVE. Regex + public offerings |
| Catalog / attach offering | `guest-catalog-actions.ts`, `attachOfferingToGuestInquiry` | LIVE |
| Real free slots | `lib/scheduling/next-free-times.ts`, client `onPickTime` | LIVE (scripted cards, not LLM) |
| Pay link mint | `lib/payments/links.ts` `createPaymentLink`; guest `onRequestPayLink` / accept-offer path | LIVE for humans/cards; **no AI caller** |
| Guest → talent inbox | Guest message always lands in Messages v5 | LIVE. Scripted, no AI agent in middle |
| Contact handoff UI | `GuestHandoffContactStrip.tsx` | LIVE (identity carry, not AI→human) |
| Support Desk AI escalate | `api/ai/support-chat`, `guest-support-chat`, `support-ai-guardrails`, `guest-ai-turns.ts` (ceiling 6) | LIVE for **platform help only**. Must not be reused as the booker |
| AI spend gate + log | `ai-usage-gate.ts`, `record-generation-usage.ts`, `cms_ai_usage_log`, `ai_usage_monthly`, `ai-model-costs.ts` | LIVE for builder/support/image — **not** booking chat |
| Chat on/off | `talent_sites.chat_enabled`, `tenant_guest_chat_settings.enabled` | LIVE. **Not** an AI-assistant toggle |
| LLM booker | — | **NOT BUILT** (S8 #38–43 ❌) |

Standing rule from inventory: *“There is NO LLM that books or quotes on the guest front chat.”* This design is the first intentional exception, with hard tool guardrails.

---

## 2. Non-negotiables (locked before build)

1. **One engine.** Assistant lives inside the guest dock + `/c/[inquiryId]` thread. No parallel chat widget. Skins may restyle; conformance test must fail if book/pay/handoff/instant-answer controls disappear.
2. **Facts only from tools.** Prices, durations, slots, and payment amounts come from server tools over real offerings / scheduling / `createPaymentLink`. The model never invents a number or a free slot.
3. **Instant-answer stays first.** Price/duration questions keep using `guest-instant-answer` (zero LLM cost) when it matches. LLM runs only when instant-answer returns null **and** booking/assistant intent is present (or talent toggle allows assistant on every non-instant turn — see §6 default).
4. **Paid only after webhook.** AI may mint a link; PAID stamp follows existing Stripe webhook path. Same as S8 #39 and current card pay flow.
5. **Handoff when unsure.** Low confidence, out-of-catalog, schedule conflict the tools cannot resolve, or guest asks for a human → stop tools, post handoff message, open/flag thread for talent.
6. **Talent override wins.** Any AI-created hold, offer, or unpaid link can be cancelled / superseded from Messages like a staff action. Trail is visible in-thread.
7. **Per-talent on/off.** Distinct from `chatEnabled`. Off = today’s scripted dock, zero LLM calls.
8. **Credits budget enforced.** Every LLM call passes `assertAiInvocationAllowed` and logs `feature: "booking_assistant"` into `cms_ai_usage_log` with `estimateCostUsd`. Cap hit → degrade to scripted dock + handoff copy, never a half-booking.
9. **Spanish = neutral Mexican (tú).** No em dashes in user-facing copy.
10. **Order vs TUL-12 / TUL-47.** Card notes: TUL-12 (one chat engine + skins) first; this assistant on top; Lala Bot (TUL-47) later as multi-trade extension. Do not fork a kitchen/orders bot here.

---

## 3. Guest journey (happy path)

| # | Guest | System | Falsified by |
|---|---|---|---|
| 1 | Opens site, taps chat | Dock mounts (existing). If AI off → scripted dock only | AI replies when toggle off |
| 2 | “¿Cuánto cuesta el Soft Gel?” | Instant-answer matches offering → reply from public catalog, **no LLM** | LLM call for a pure price question; invented price |
| 3 | “Quiero el Soft Gel el viernes” | LLM turn with tools: resolve offering → list free slots → propose 1–3 times | Slot not in `next-free-times`; service not in public offerings |
| 4a Instant-book talent | Guest confirms a slot | Tool creates hold/booking via existing guest booking path; status card in thread | Booking without identity when policy requires it; double-book |
| 4b Deposit / pay-first | Guest confirms | Tool mints `createPaymentLink`; v5 pay card + GuestNextStep “Pay”; PAID after webhook | PAID before webhook; AI-invented amount |
| 5 | Asks something outside catalog / “hablo con ella” | Handoff: AI stops; talent notified; guest told someone will reply | AI keeps guessing; silent fail |
| 6 | Talent opens Messages | Sees AI trail (service, slot, link) + Override (cancel hold / revoke unpaid link / reply as self) | No trail; override impossible |

Identity: reuse existing guest gate / claim email. Booking and pay-link tools require the same identity bar the scripted path already requires (instant-answer remains pre-identity).

---

## 4. Architecture (proposal)

```
Guest message
    │
    ├─ guest-instant-answer? ──yes──► scripted reply (no LLM)
    │
    ├─ AI toggle off / spend cap / turn ceiling? ──yes──► scripted dock / handoff copy
    │
    └─ bookingAssistantTurn (new)
           │
           ├─ system prompt: talent voice, locale, “tools only for facts”
           ├─ tools (server-executed, never model-side writes):
           │     list_public_offerings
           │     answer_price_duration   (wraps instant-answer / catalog)
           │     list_free_slots
           │     create_hold_or_booking  (existing guest booking actions)
           │     mint_payment_link       (createPaymentLink)
           │     handoff_to_talent
           ├─ guardrails: confidence / escalate (pattern from support-ai-guardrails)
           └─ persist: inquiry messages + ai_action trail + usage log
```

### Suggested surfaces (names provisional)

| Layer | Proposed location | Notes |
|---|---|---|
| Route / action | `app/api/ai/booking-assistant/route.ts` **or** server action under `_actions/` | Prefer token-aware guest action colocated with dock; Support Desk routes stay untouched |
| Tool runners | `lib/ai/booking-assistant/tools.ts` | Thin wrappers over `next-free-times`, catalog, `createPaymentLink`, guest booking |
| Guardrails | `lib/ai/booking-assistant/guardrails.ts` | Mirror support escalate; never invent |
| Toggle | `talent_sites` JSON / column e.g. `ai_booking_assistant_enabled` default **false** until PM says default-on | Hosted next to `chat_enabled` in site switches + Guest chat drawer |
| Trail | inquiry message `kind` / payload or `ai_actions` jsonb on inquiry | Must be readable in Messages v5 talent UI |
| Usage | `recordAiGenerationUsage` with `feature: "booking_assistant"` | Extends existing log; may need allow-list action value — decide at build |

**Do not** extend `guest-support-chat` with booking tools. Different product, different grounding corpus, different risk.

---

## 5. Talent controls

| Control | Behavior |
|---|---|
| **AI assistant on/off** (per talent) | Off = scripted dock (today). On = LLM path after instant-answer miss |
| **Override** | In Messages: Cancel AI hold; Void unpaid AI pay link; Take over thread (suppress further AI turns on that inquiry) |
| **Optional later** | Auto-book vs “propose only” (talent confirms). **v1 recommendation: propose + guest confirm for non-instant-book; auto-complete only when `talentOffersInstantBooking` already allows it** |

UI: one switch under Website settings / Guest chat (copy: “Asistente que agenda por ti”). Not buried only in platform flags.

Platform kill switch: reuse pattern `ai_master_enabled` — if master off, booking assistant never runs.

---

## 6. Decision defaults (say so if wrong)

| # | Decision | Default in this design |
|---|---|---|
| D1 | Default toggle for new talents | **Off** until PM approves default-on (cost control) |
| D2 | When AI is on, which turns hit LLM? | Instant-answer first; else LLM if message looks like book/ask/availability **or** thread already in an AI booking session |
| D3 | Model | **Haiku-class / `gpt-4.1-mini`** for tool loop (cheap, fast). Same family as support guest path preference for latency |
| D4 | Max AI replies per inquiry | **8** (support uses 6; booking needs a few more for slot negotiation) then forced handoff |
| D5 | Max tool rounds per user message | **3** |
| D6 | Pay vs book | Prefer existing talent payment policy (instant book / deposit / pay link). AI does not invent a payment mode |
| D7 | Agency dock | Same assistant when dock is talent-scoped; agency-wide multi-talent routing = **out of v1** (Lala Bot / TUL-47) |
| D8 | MCP / external agents | **Out of scope** (#42 paused) |

---

## 7. AI credits budget — per-call cost estimate

Prices from `web/src/lib/ai/ai-model-costs.ts` (list rates as of 2026-07 in that file).

### Assumptions per booking-assistant LLM call

| | Tokens (est.) | Notes |
|---|---|---|
| Input | ~1,200 | System + short catalog summary + last 6 turns + tool schemas |
| Output | ~350 | Reply + tool JSON (thinking disabled, same lesson as guest-support) |
| Tools | 0–3 server tools | Tools are DB/scheduling; negligible vs LLM |

### Cost per LLM call (USD)

| Model | Input $/M | Output $/M | Est. cost / call |
|---|---|---|---|
| `claude-haiku` | 1 | 5 | **~$0.0030** |
| `gpt-4.1-mini` | 0.4 | 1.6 | **~$0.0010** |
| `gpt-4.1` | 2 | 8 | ~$0.0052 |
| `claude-sonnet` (4.6 rates) | 3 | 15 | ~$0.0089 |

**Recommended default: `gpt-4.1-mini` or Haiku ≈ $0.001–$0.003 / call.**

### Cost per successful booking conversation

Typical path: 1 instant-answer (free) + 2–4 LLM turns (slot propose, confirm, pay link).

| Scenario | LLM calls | Cost @ mini | Cost @ Haiku |
|---|---|---|---|
| Price question only | 0 | $0 | $0 |
| Book + confirm | 3 | **~$0.003** | **~$0.009** |
| Book + pay link + one clarify | 4 | **~$0.004** | **~$0.012** |
| Confused → handoff | 2 | ~$0.002 | ~$0.006 |

### Monthly budget sketch (for PM)

| Volume | Calls/mo (assume 3 LLM / booking chat) | Spend @ $0.002 avg |
|---|---|---|
| 100 booking chats | 300 | **~$0.60** |
| 1,000 | 3,000 | **~$6** |
| 10,000 | 30,000 | **~$60** |

**Proposed caps (v1):**

- Per inquiry: 8 AI replies (D4).
- Per talent / tenant month: fold into existing `monthly_spend_cap_cents` via `assertAiInvocationAllowed`; optional dedicated soft budget e.g. **$5 / talent / month** logged under `booking_assistant` for ops visibility (PM to set number).
- Hard stop on cap: handoff copy, no silent tool execution.
- Instant-answer remains free and preferred for price/duration to keep most traffic off the LLM.

All calls must write `cms_ai_usage_log` with `context_jsonb.feature = "booking_assistant"` and `cost_usd` from `estimateCostUsd` so the platform AI dashboard can filter this product.

---

## 8. Build slices (after approval only)

Docs-only now. Suggested PR order once PM says go:

| Slice | Delivers | Proof |
|---|---|---|
| **G0** | Toggle + flag + usage feature key + “AI off = no call” test | Unit + settings UI on TAL-93900 clone |
| **G1** | Read-only tools: offerings + slots + instant-answer wrap; LLM replies facts only; no writes | Guest ask price/availability on QA host; no invent |
| **G2** | `create_hold_or_booking` + trail in Messages; talent cancel | S8 #38 partial |
| **G3** | `mint_payment_link` + PAID after webhook | S8 #39 |
| **G4** | Handoff policy + turn ceiling + override “take over” | S8 #40–41 |
| **G5** | Skin conformance: card + standard both expose assistant entry points | TUL-12 alignment |
| **G6** | Live QA ES/EN on TAL-93900 (jorg-beauty-qa), never real Jorgelina write | S8 checklist |

Migrations: only if toggle needs a column (prefer `chat_config` / site JSON first to avoid migration coordination). If a column is required: fresh `date -u +%Y%m%d%H%M%S`, note on card; PM `db:push`.

---

## 9. Out of scope

- MCP / agent-to-agent booking (#42)
- Lala Bot kitchen/orders multi-trade (TUL-47)
- WhatsApp / Instagram channel worker as the AI host (web dock first)
- Agency multi-talent routing (“book any stylist”)
- Tips, guest reschedule/cancel (front-chat inventory gaps; separate cards)
- Reusing Support Desk corpus or routes for booking

---

## 10. Open questions for PM / Oran

1. **Default on or off** for paid talents at launch? (Design default: **off**.)
2. Confirm **model**: mini vs Haiku vs tenant-routed via existing `resolveAiChatAdapter`.
3. Soft monthly budget per talent: **$5** OK, or different number / plan-tiered?
4. v1 **auto-book** when instant-book is on, or always “propose → guest confirm”?
5. Should Free plan get the assistant at all, or paid-only?

---

## 11. References

- Notion [TUL-36](https://app.notion.com/p/3ef2c5ee9743814598def4d3cc532ee6) · Parent [EPIC F · Agentic booking](https://app.notion.com/p/3f22c5ee9743815b8955d0c9ceed8182)
- `docs/plans/front-chat/00-inventory.md` — one engine, no LLM booker today
- `docs/plans/chat-card-front-door-merge.md` — skin-only themes
- `docs/handover/cursor-2026-10-04/plans/done-status/STATUS.md` — S8 #38–43
- Support escalate pattern: `lib/support/support-ai-guardrails.ts`, `guest-ai-turns.ts`
- Cost table: `lib/ai/ai-model-costs.ts`
