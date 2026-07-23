# Conversational Inquiry — SHIPPED + Handoff (2026-06-04)

**Status: LIVE on production.** Guest chat on talent profiles is merged to `main`, deployed,
and verified working end-to-end on `improntamodels.com`. This doc is the full record + a
step-by-step QA guide you can run yourself + how to fix errors you find.

---

## 1. What shipped (the feature)

A floating **"Message {name}"** pill on every public talent profile (`/t/[profileCode]`).
A guest (no login) taps it → a mini chat opens → they send a message → a **real inquiry** is
created and flows into the existing Messages shell → the talent/coordinator can reply → the
talent sees a **buyer trust chip**. Verified live: launcher → panel → warm opener → first
message → name+email gate → inquiry created → auto-acknowledgement → "we emailed you a copy"
→ thread mode ("Write a reply…").

**Key files (all on `main`):**
- UI: `web/src/app/t/[profileCode]/_chat/` (`TalentProfileChatLauncher`, `TalentProfileChatLauncherMount`, `MiniChatPanel`, `MiniChatMessageBubble`, `mini-chat-styles`) + mount in `web/src/app/t/[profileCode]/page.tsx`
- Server actions: `web/src/app/t/[profileCode]/_actions/guest-chat-actions.ts` (`startGuestChatInquiry`, `sendGuestMessageAction`, `getGuestThreadMessages`)
- Engine: guest-sender branch in `web/src/lib/inquiry/inquiry-engine-messages.ts` + `inquiry-permissions.ts`
- Trust chip: `web/src/components/inquiry/GuestTrustChip.tsx` + mapper, mounted in `messages/shared/machinery-16.tsx`, fed by `talent/inbox/[id]/actions.ts → loadTalentInquiryGuestTrust`
- Anti-abuse: `web/src/lib/rate-limit-kv.ts` (Upstash), `email/disposable.ts`, `captcha/verify.ts`, `inquiry/guest-abuse-guard.ts`, `inquiry/recipient-safety.ts`
- Claim: email-gated `merge_guest_session_to_client` + `server-actions/client-guest-merge.ts`
- Migrations (applied to prod): `20261017090000` (guest_session_id on inquiry_messages), `20261017091500` (email-gated claim RPC), `20261018000000` (user_blocks + inquiry_reports, service-role-write-only)

**Live infra:** Upstash Redis DB `tulala-guest-chat-rl` (us-east-1, free) — `UPSTASH_REDIS_REST_URL`
+ `UPSTASH_REDIS_REST_TOKEN` set in Vercel (`tulala`) production + development.

**PRs:** #235 (feature) + #239 (the QA hotfix below). Both squash-merged to `main`.

---

## 2. The full journey (all work done)

Built via a multi-agent workflow, with verification at every convergence point:

1. **Contracts + 5 parallel build lanes** (worktree-isolated): backend, anti-abuse, safety, UI, trust/presence.
2. **Salvage + integrate** — lanes leaked into the shared checkout; recovered all work, assembled one branch. **Caught a regression**: stale-base lanes had deleted an unrelated voice-notes feature → restored.
3. **Adversarial verification** (5 read-only skeptics) — found a **HIGH cross-tenant RLS write hole** (any authenticated user could write block/report rows into any tenant) + a **HIGH cookie-rotation spam bypass**.
4. **Fix pass** — closed both HIGH findings + UI bugs (double-prefix, failed-send data loss, captcha soft-brick) + hardening.
5. **Re-verify** — runtime-proved the RLS hole closed (forged-JWT probes against the DB); spam now keyed on IP + normalized email.
6. **Polish** — mounted the trust chip in the talent thread; bounded the velocity map; cleaned the disposable list.
7. **Merge current main** — cleared base drift (9 commits: integrations, flags, `_light` profile redesign, pin-messages); 2 conflicts resolved keeping both sides.
8. **Ship** — applied 3 migrations to prod Supabase (Management-API path), merged PR #235, re-aligned domains, deployed.
9. **Live QA** — drove the chat on `improntamodels.com`; **found + fixed a validation bug** (§4); re-deployed; confirmed the full loop works.

Recurring lessons (worth keeping): parallel worktree lanes can leak into the shared checkout →
**commit-first, integrate sequentially, and always check deletion counts vs. the merge-base**
(base drift produces phantom "deletions" that look like regressions but aren't).

---

## 3. How YOU do the QA — step by step

You can re-run this anytime (or after any change). It works on the live site.

1. **Open a talent profile.** Go to `https://improntamodels.com/t/TAL-00036` (Anto) — or any
   `/t/<code>` from `/directory`. The page should load (the `_light` redesign).
2. **Find the launcher.** Bottom-right: a floating **"Message {name}"** pill. (It only renders
   on agency-hosted profiles — Impronta qualifies.)
3. **Open it.** Click the pill → a mini chat opens with the header "Leave a message — the team
   replies by email" and a warm opener ("Hi — I'm {name}'s booking assistant…").
4. **Type a first message** in the composer (e.g. "Need a model for a shoot in Tulum next
   Friday, ~8000 MXN. Available?") and hit the send arrow.
5. **The name+email gate appears** ("Where should {name} reach you?") with your message
   preserved. Enter a name + a **real (non-disposable) email** and click **Send message**.
6. **Success looks like this** (what I verified): the header flips to **"Open conversation"**,
   your message shows as a sent bubble, then **"Got it — we've received your message and will
   be in touch shortly"** + **"We emailed a copy to {email}…"**, and the composer becomes
   **"Write a reply…"**. You can keep sending — that's guest-in-thread continuation.
7. **Verify the inquiry landed** (talent/coordinator side): log into the workspace as Impronta
   staff/coordinator → Messages → the new inquiry from your guest name should be there, and
   opening it should show the **trust chip** at the top of the thread (tier badge, "✓ email"
   if verified, booking count, block/report).
8. **(Optional) test the guards:**
   - **Disposable email** (e.g. `x@mailinator.com`) → should be rejected ("use a non-disposable email").
   - **Empty name/email** → "Send message" stays disabled.
   - **Spam volume** → rapid repeated sends should eventually rate-limit (in prod, with Upstash).

**Gotcha if you automate the browser:** filling React inputs by *setting the value* (e.g. some
automation tools' "form fill") does **not** fire React's `onChange`, so the app sees empty
fields and rejects the send. **Type with real keystrokes** instead. (This bit me during QA and
looked like an app bug until I checked — it wasn't.)

---

## 4. How to fix errors you find — the method + a worked example

**The method (what I did for the real bug below):**
1. **Reproduce** in the UI; note the exact on-screen error text.
2. **Check the console + network** (browser devtools) — is it a client validation message, or a
   server error/4xx/5xx? (Grammarly/extension errors are noise — ignore them.)
3. **Grep the codebase for the exact error string** to find the precise code path:
   `grep -rn "Add the missing details" web/src`
4. **Read the failing function** and find the real condition.
5. **Fix on a branch off `main`**, gate (`cd web && npx tsc --noEmit && npm run lint`), commit,
   open a PR, squash-merge → auto-deploys. Re-QA.

**Worked example — the bug I found + fixed during this QA (PR #239):**
- **Symptom:** first guest send failed with *"Add the missing details and try again."* even with
  name + email + message all filled.
- **Diagnosis:** `grep` → the string came from `guest-chat-actions.ts:598`, a `validation_failed`
  returned by `createInquiryFromIntent`. Reading `validateIntentForSubmit` (`inquiry-intent.ts`):
  it **hard-requires** `requester.name`, `requester.email|phone`, `brief.summary|talent`,
  **`location.city|status`**, and **`date.event_date|status`**. The guest-chat intent only set
  requester + talent + brief — it **never set `location` or `date`**, so validation failed. (The
  code comment wrongly assumed only summary-or-talent was required.)
- **Fix:** a guest hasn't said when/where yet (that's the whole point — it comes up in the chat),
  so seed `location: { status: "not_sure" }` and `date: { status: "not_sure" }` on the intent.
  Two lines. tsc 0 / lint 0 → PR #239 → merged → re-QA → ✅ works.

This is the pattern for anything else you hit: **grep the error → read the function → fix the
real condition → gate → PR → re-QA.**

---

## 5. Known follow-ups (non-blocking; flagged, not done)

- **Provision Upstash in the smoke check's view.** Vars ARE set in Vercel prod, but `deploy:smoke`
  checks local `process.env`, so it warns "floor disabled." Refine the check to probe the live
  deployment, not local env. (The floor itself is live in prod.)
- **Enable Supabase email confirmations** (`enable_confirmations`) — auto-confirm currently
  weakens the guest→account claim's email gate (safe today via an implicit invariant; see the
  re-verify notes).
- **HMAC-sign the guest cookie** — the rate-limit/ownership identity is a client-settable cookie;
  the IP+email keying mitigates the spam vector, but signing it is the durable fix.
- **Trust chip badges:** phone/social/payment verification badges currently render absent
  (`trustSummary` is null server-side) — only tier / email-verified / booking-count / block are
  live. Wire the remaining signals when ready.
- **Conversational capture / AI extraction** — today the first message becomes the brief summary;
  later, parse date/location/headcount/budget from the chat to pre-fill the structured inquiry
  (the strategy doc's Phase 3).

## 6. QA test artifact to clean up

Live QA created one real test inquiry on prod: guest **"Claude QA Tester"** /
`claude.qa.guestchat@gmail.com` on Anto (`TAL-00036`), with a provisioned client account + a
`guest_sessions` row + an `inquiry_messages` row. Delete it (and the provisioned auth user) when
convenient, or keep it as evidence.

---

**Strategy/design docs (for the full product thinking):**
`web/docs/conversational-inquiry-{strategy,deep-dives,execution-plan}-2026-06-03.md`.
