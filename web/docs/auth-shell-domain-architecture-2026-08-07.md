# Auth, Shells & Domains — Architecture Audit + Execution Plan (2026-08-07)

**Status: EXECUTED (P1–P5 merged) — see §12 for the independent post-ship audit
with per-phase DONE / PARTIAL verdicts and the remaining gap list. D1 + D2 are
implemented in code; treat this doc as binding for all auth-surface work.**

Owner prompt: the auth pages look disconnected from the marketing site and the
storefronts ("the design is very poor... dead ends always come"), and it is
unclear which domain should own authentication (`app.tulala.digital`?) versus
tenant domains and the marketing site — plus a future mobile app must let
talent/users enter quickly.

Honest scores today: **auth UX 3/10** (works; visually orphaned, five
inconsistent entry pages, recurring dead ends), **domain architecture 6/10**
(the host model is right; the execution is scattered). Target after this plan:
**8–9/10 with LESS surface to maintain than today.**

Post-ship audit verdict (2026-08-08): **auth UX 7.5/10, domain architecture
8/10.** Evidence and the reasons it is not 8.5 are in §12.

---

## 1. The mental model everything follows: three audiences, three trust anchors

Every confusing question ("which domain? which shell? which brand?") resolves
instantly once you ask **who is standing in front of the page and who do they
trust**:

| Audience | Trust anchor | Where they should authenticate |
|---|---|---|
| **Operators / agency staff** (Alejandra, her team, new SaaS signups) | **Tulala** — they bought a platform | `tulala.digital` / `app.tulala.digital` (sessions already span both — cookie is scoped to `.tulala.digital`). Whitelabel staff (Agency/Network tier) may also use their own domain's `/admin` — the #912 branded-admin work already made that canonical. |
| **Talent** | **Depends on how they arrived.** Invited/claimed by an agency → the AGENCY. Self-signup from marketing/hub → Tulala. | On the host they arrived on. Claim links stay on `improntamodels.com`; marketing signup stays on `tulala.digital`. Identity is platform-global either way (one account works across agencies) — the Substack model: branded front door, global account. |
| **Clients / bookers** | **The storefront** they are booking on | Ideally never a password page at all — guest-first (already built: guest chat + claim relink), email OTP to persist. A client must never be bounced to `app.tulala.digital`. |

This is what the comparable top companies actually do:

- **Shopify**: merchant auth centralized (accounts.shopify.com) because merchants
  are single-brand customers of Shopify; but **buyer/customer accounts render on
  the shop's own branded surface**. Two audiences, two answers.
- **Substack**: reader auth happens on the publication's own domain (branded),
  via email link/OTP, while the account is platform-global. Exactly our talent
  case.
- **Fresha / Booksy / GlossGenius** (services verticals): pros sign in on the
  platform; consumers book on branded pages with the lightest possible auth
  (guest + OTP), never a platform login wall.

## 2. The domain ruling (Decision D1)

**D1 — Auth stays HOST-LOCAL. We explicitly retire the code comment's "future
direction: centralize auth on app.tulala.digital" (surface-allow-list.ts).**

Why centralizing is wrong *for this stack specifically*, not just aesthetically:

1. **The browser forbids the easy version.** Session cookies cannot span
   `improntamodels.com ↔ app.tulala.digital` (different registrable domains).
   Centralized auth would force an OAuth-style token-handoff redirect dance to
   plant a session back on every custom domain. That is real, permanent
   engineering surface — and our worst historical auth sev-1s are exactly this
   class (the PKCE host-only-cookie incident, PRs #799–#835).
2. **It breaks the whitelabel promise you sell.** An Impronta-invited talent
   handed to a Tulala-branded login mid-claim is the trust break we just spent
   a day eliminating.
3. **The infra is already correct**: one Supabase identity backend behind every
   host; `.tulala.digital`-scoped cookies already unify marketing + app;
   custom domains are correctly host-only. There is nothing to move — only
   chrome to fix.

What `app.tulala.digital` IS for: the workspace surface for tenants without a
custom domain, the platform HQ, and the canonical `next=` target for operator
flows. It keeps its auth pages; it is simply not *the* auth domain.

## 3. Why "dead ends always come" — and the structural fix

Every recent breakage was the same bug wearing different clothes: **a path ×
host-kind matrix (8 auth routes × 4 host kinds) with no contract test.**
`/claim` 404 on branded hosts; canonical admin pages naked on branded hosts
(#1017); `/get-started` 404s on `improntamodels.com` **today** (verified
2026-08-07 — any tenant surface that ever links it dies); the signed-in claim
click silently dropped.

Fix is not more care — it is a **surface-matrix smoke**: extend `deploy:smoke`
with ~16 curl assertions (each auth route × each host kind → expected
200/307/404). Minutes to build, kills the entire class. (Phase P3.)

## 4. The shell ruling (Decision D2) + design spec

**D2 — ONE auth shell, host-branded, deliberately minimal. Not the marketing
shell.** Every exit link on a signup page costs conversions (Stripe, Linear,
Shopify all strip nav here), and the marketing nav would be actively wrong on
tenant domains. The current shell's failure is not minimalism — it is that the
minimalism is unfinished: naked wordmark, skeletal footer, floating unstyled
fields, zero context. "Minimal" must not mean "abandoned".

**Auth Shell v2 spec (all 8 routes, all hosts, EN/ES):**

- **Split layout ≥1024px** (the pattern that makes auth feel designed, used by
  Shopify/Linear): left = brand panel, right = form card. Single column on
  mobile with compact brand header.
  - Left panel, host-aware: tenant hosts → agency imagery (storefront
    hero/cover), logo, one-line value line ("Manage your bookings with
    Impronta Models"); platform hosts → Tulala gradient + tagline + three
    checkmarks (mirrors the marketing hero we already have).
- **Form card**: real elevated card (`--plt-card`, radius 16, shadow, 32px
  padding, max-w 440) — the same visual language as the marketing signup modal
  the owner likes, so the popup and the standalone pages stop looking like two
  products. Inputs h-11 with brand-accent focus ring; full-width primary
  button; consistent divider/"OR"; error/pending states styled once, shared.
- **Header**: full brand lockup (logo + tagline — tenant tagline from business
  identity on tenant hosts, Tulala's on platform) + one **"← Back to
  {site-name}"** affordance. Nothing else.
- **Footer parity**: both branches get brand line + tagline + Terms/Privacy/
  Contact + the language toggle (moved out of the form column).
- Claim/invite/join keep their contextual headlines (shipped in #1033) inside
  this shell.

## 5. Entry-point consolidation (kills 3 page designs)

Today: `/register`, `/talent/register`, `/client/register`, `/join`,
`/get-started` modal — five differently-designed front doors. Consolidate:

- **One `/register` page** driven by intent: `?as=talent|client|operator` (+
  `?invitation=` for claims, existing). Old URLs 301 into it — links and SEO
  keep working; three bespoke page designs are deleted.
- `/get-started` (operator funnel + its modal) stays — it is the one funnel
  with real conversion design — but its modal and `/register` share the same
  form-card components after P1, so they finally look related.
- Copy per intent lives in the existing i18n catalog exactly like
  claimTitle/inviteTitle already do.

## 6. Client (booker) auth: passwordless-first

Clients should almost never see a password form. The rails exist already
(guest chat, first-confirm-wins claim relink, Resend). Make **email OTP /
magic link the default** for the client intent, password an "advanced" option.
Fewer resets, fewer abandoned bookings, fewer support cycles — and it is the
single best preparation for mobile.

## 7. Mobile app readiness (do these cheap things NOW, not later)

1. **OTP-first auth** (P4) — the exact flow a mobile app wants; no new backend
   later, Supabase SDKs share it.
2. **Keep claim/invite links as canonical HTTPS URLs on real hosts** (already
   true) — later, Universal Links / App Links let the app intercept the same
   emails with zero email-template changes. Add the
   `apple-app-site-association` / `assetlinks.json` stubs when the app starts.
3. **Sign in with Apple** must accompany Google on iOS (App Store rule) — plan
   the button slot in Shell v2 now so the layout doesn't reflow later.
4. Never introduce web-only session hacks (token handoff pages, iframe auth) —
   another reason D1 rejects centralization.

## 8. Cost / resource reductions this plan banks

| Change | What it saves |
|---|---|
| One shell + one register page | 5 designed surfaces → 2; every future auth change (i18n, branding, legal) lands once |
| Surface-matrix smoke in deploy:smoke | The recurring "dead end on branded host" class — three prod incidents in two days — becomes a red build instead of an owner discovery |
| OTP-first clients | Password-reset support, abandoned-booking loss, and the mobile auth build later |
| Rejecting auth centralization | An OAuth token-handoff subsystem we never build or debug (our worst prior sev-1 class) |
| Brand from one resolver (`resolveAuthBrand` + shell-brand-logo) | Zero per-tenant auth work when new whitelabel tenants onboard; upload logo once → 8 pages × every host |

## 9. Execution plan

| Phase | Scope | Size | Depends on |
|---|---|---|---|
| **P0 — done** | Claim copy + signed-in forward (#1033), tenant logo resolver in auth chrome (#1033), `/claim` allow-listed (#1019) | shipped | — |
| **P1 — Auth Shell v2** | Split layout, form card, header lockup + back link, footer parity, host-aware brand panel; marketing-modal visual parity | 1 PR, no schema | D2 |
| **P2 — Entry consolidation** | Single `/register` w/ intent param; 301s from `/talent/register`, `/client/register`; shared form components with the get-started modal | 1–2 PRs | P1 |
| **P3 — Surface-matrix smoke** | deploy:smoke: auth routes × host kinds curl matrix (incl. `/get-started` branded-host expectation) | tiny PR | — (do first, it's independent) |
| **P4 — Passwordless clients** | OTP/magic-link default for client intent; password behind "use a password instead" | 1 PR | P2 |
| **P5 — Mobile prep (when app work starts)** | AASA/assetlinks stubs, Apple sign-in slot, deep-link QA for claim/invite emails | small | P4 |
| **Non-goals** | Centralizing auth on app.tulala.digital; a second auth stack; marketing nav on auth pages | — | D1/D2 |

Impronta-specific prerequisite for the branded experience: **upload the logo in
Settings → Branding** (`improntamodels.com/admin/settings` → Branding & media)
— the resolver is live and waiting; branding data is currently empty.

## 10. Decisions needed from the owner

- **D1**: Auth stays host-local; the "centralize on app.tulala.digital" note in
  `surface-allow-list.ts` is retired (we will edit the comment to point here).
- **D2**: One minimal host-branded auth shell (split-panel design above) — NOT
  the marketing shell — for all 8 auth routes.

Sign-off on these two makes this doc binding; P3 can start immediately either
way.

## 11. Mobile readiness — current state (2026-08-07, P5 groundwork landed)

P5 said "do these cheap things now, not later." Status as of this pass —
**no native app exists yet and none of this builds one**; it is groundwork
only, done because it costs almost nothing today and is expensive to retrofit:

1. **OTP-first auth (P4)** — shipped (#1061). The client-intent flow at
   `/login` and `/register` defaults to emailed sign-in codes
   (`EmailCodeForm`), the exact primitive a mobile app's SDK-driven sign-in
   will reuse. No mobile-specific work left here.
2. **Canonical HTTPS claim/invite links** — already true; unchanged by this
   pass. Claim/invite emails link to real hosts (`/claim/...`,
   `/invite/...`), not app-only deep-link schemes, so Universal Links / App
   Links can intercept the same emails later with zero email-template
   changes.
3. **Well-known deep-link association stubs** — added this pass:
   - `web/src/app/.well-known/apple-app-site-association/route.ts` — Apple
     Universal Links (AASA), served as `application/json`.
   - `web/src/app/.well-known/assetlinks.json/route.ts` — Android App Links
     (Digital Asset Links), served as `application/json`.
   - Both are host-agnostic in `surface-allow-list.ts`
     (`WELL_KNOWN_PREFIX`) so they resolve on any host kind without a
     surface-allow-list change once the app exists.
   - Both currently hold **placeholder** values only (Apple Team ID + bundle
     ID; Android package name + release SHA-256 cert fingerprint) — see the
     `TODO` comments in each route file for exactly what to fill in and
     where to source it.
4. **Apple sign-in button slot** — reserved in
   `web/src/app/(auth)/login/page.tsx`, directly below `<LoginGoogleButton />`
   and commented out (not flag-gated) with a step-by-step TODO: configure the
   Apple provider in Supabase Auth, add an `/auth/apple` route +
   `LoginAppleButton` mirroring the Google popup flow, add the i18n string,
   then uncomment. Sized to sit in the same card position as the Google
   button so enabling it later is a content change, not a layout change.
   Required before iOS App Store submission per Guideline 4.8 (any app
   offering a third-party sign-in, here Google, must also offer Sign in with
   Apple).

### Exact remaining steps to actually ship a mobile app

None of the following is done, and none of it should be started before an
app is actually being built:

- Register real values in the two well-known stubs (Apple Team ID + bundle
  identifier; Android package name + release signing cert SHA-256
  fingerprint) and narrow AASA `paths` from `"*"` to the real deep-link
  routes.
- Add `com.apple.developer.associated-domains` (`applinks:<host>`) to the
  iOS entitlements and the matching Android `intentFilter` /
  `autoVerify="true"` App Links config — client-side work, not this repo.
- Configure the Apple OAuth provider in the Supabase Auth dashboard, add the
  `/auth/apple` route + `LoginAppleButton`, then uncomment the slot in
  `login/page.tsx`.
- Confirm which host is the actual Universal Link / App Link domain
  (`app.tulala.digital` vs `tulala.digital`) before entitlements are written
  — this doc's D1/D2 rulings (host-local auth, one shared shell) mean
  whichever host is picked, the auth surface is already consistent across
  hosts, so this is a one-time choice, not per-tenant work.
- Scaffold the actual native app (out of scope for this repo entirely until
  that project starts).

---

## 12. Post-ship audit (2026-08-08) — independent verification

This section was written by an auditing pass that **did not implement any of
P1-P5** and deliberately did not trust the phase reports. Everything below was
re-verified from `origin/main` plus live HTTP probes and browser screenshots of
production. Where a phase report was optimistic, that is called out.

### Commits confirmed on `origin/main`

All six auth-program merge commits are ancestors of `origin/main`
(`git merge-base --is-ancestor`, checked 2026-08-08):

| PR | Commit | Phase |
|---|---|---|
| #1053 | `dd78b0664` | P3 auth surface matrix in deploy smoke |
| #1054 | `1d0b50bbf` | P1 Auth Shell v2 |
| #1055 | `00ec443a8` | P1 tenant panel copy fix |
| #1059 | `661673e24` | P2 one signup front door |
| #1060 | `f3eea9d10` | P2 smoke matrix follow-up |
| #1061 | `caed735df` | P4 client passwordless-first |
| #1062 | `cd4a2dd40` | P5 mobile groundwork |

### Per-phase verdicts

| Phase | Verdict | What was actually verified |
|---|---|---|
| P0 | **DONE** | `/claim` allow-listed and reachable; claim copy + signed-in forward present in `(auth)/claim/page.tsx` and `(auth)/register/page.tsx`. |
| P1 Auth Shell v2 | **DONE** | Shell v2 renders live on `improntamodels.com` and `tulala.digital`: the `lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]` split, the sticky `lg:h-dvh` brand panel, the `rounded-[28px]` form card on `--plt-bg-elevated`, and footer parity (brand line + tagline + Terms/Privacy/Contact, EN/ES toggle on the tenant host). Platform host takes the forest gradient + three `hero.trust` proof chips; the tenant host takes the ink gradient with no chips, as specified. Desktop (1440) and mobile (375x812) both screenshot-verified — this closes the mobile geometry P2 could not check. |
| P2 One signup front door | **PARTIAL** | The consolidation itself is correct: `/talent/register`, `/client/register`, `/join` all answer **308** into `/register?as=…` on all three hosts (`tulala.digital`, `app.tulala.digital`, `improntamodels.com`), with every query param preserved and an inbound `as`/`role` replaced rather than duplicated. Per-intent copy differs correctly for `?as=talent` / `?as=client` / `?as=operator` / `?role=talent` (legacy alias) / plain. Intent survives the register↔login cross-link for the client lane. **The gap: the locale prefix is dropped — see A1 below.** |
| P3 Surface-matrix smoke | **DONE** | `npm run deploy:smoke` from a checkout at `main` HEAD: 18/18 auth-matrix assertions green, all sections pass, 1 pre-existing warning (`RESEND_API_KEY` absent from local shell). |
| P4 Client passwordless-first | **DONE (code + surface); happy path still UNPROVEN** | Live on both hosts: `/register?as=client` and `/login?as=client` render the OTP card ("Email me a sign-in code", no password field, "Use a password instead" toggle); plain `/register`, `?as=talent`, `?as=operator` and plain `/login` are unchanged password-first. Redirect safety confirmed at code level. Unproven branches are listed in B1-B3. |
| P5 Mobile groundwork | **DONE (confirmed live only after waiting out the promote)** | At first probe `#1062` was merged at `cd4a2dd40` but its `CI — structural quality gate` was still `in_progress`, so `Promote production pointer` had not run: production was serving `caed735df` (P4) and both `/.well-known/*` stubs returned **404** on all three hosts. After the promote completed, both stubs answer **200 `application/json`** on `tulala.digital`, `app.tulala.digital` and `improntamodels.com`, carrying the documented placeholder values (`TEAMID.com.tulala.app`, `paths: ["*"]`). The P5 report claimed merge, never live — had this audit stopped at the first probe it would have reported a phantom defect, and had it trusted the report it would have missed a ~35 minute window in which the claim was untrue. **`WELL_KNOWN_PREFIX` host-agnostic allow-listing is confirmed working on all three host kinds.** |

### A. Real defects found by this audit

**A1 — Locale prefix is dropped by the three retired signup redirects
(regression introduced by #1059). Confirmed live.**

```
https://tulala.digital/es/talent/register  → 308 /talent/register → 308 /register?as=talent → 200 lang="en" "Join as Talent"
https://tulala.digital/es/join             → 308 /register?as=talent                        → 200 lang="en" "Join as Talent"
https://tulala.digital/es/register?as=talent                                                → 200 lang="es" "Unirse como Talento"
https://improntamodels.com/es/talent/register → … → 200 lang="en" "Join as Talent"
```

The canonical page localizes correctly; only the redirects lose Spanish. Root
cause: `buildRegisterHref()` in `web/src/lib/auth/register-intent.ts` emits a
bare `/register?…` and never re-applies the locale segment, while
`web/src/i18n/pathnames.ts` already exports `withLocaleHref` / `withLocalePath`
for exactly this (the documented marketing-locale-href rule).

Why it matters: `/join` is the "Apply as talent" CTA in the seeded Impronta noir
homepage and footer presets — per #1059's own reasoning for keeping it. A
Spanish-speaking talent clicking a Spanish CTA lands on an English signup page.
This is the primary talent-acquisition funnel.

Secondary: `/es/talent/register` costs **two** 308 hops, which #1059 explicitly
set out to eliminate.

Fix shape: make `buildRegisterHref` locale-aware (or wrap its result in
`withLocaleHref` at the three call sites in `(auth)/talent/register/page.tsx`,
`(auth)/client/register/page.tsx`, `(auth)/join/page.tsx`), and extend
`register-intent.test.ts` with `/es/` cases.

**A2 — `deploy:smoke` silently omits the P3 auth matrix when run from a stale
checkout, and does not probe the promote lag either.** Run from the shared
checkout (pinned at an older commit), the script has no auth-matrix section at
all and still prints `✓ all checks passed`. Nothing warns that the gate the
deploy is being judged against is an older gate. Any future "smoke is green"
claim must state the commit the script came from.

Separately, `deploy:smoke` asserts nothing about **which commit production is
actually serving**. The P5 probe above is the concrete cost: a fully green smoke
run coexisted with a production pointer two commits behind `main`. A cheap
addition would be one assertion that the live deployment's commit is an ancestor
of `origin/main` **and** contains the commit under test — that turns the
"merged is not done" class into a red gate instead of a manual habit.

### B. Genuine gaps carried forward (not regressions)

- **B1** — P4's happy path (a real emailed code → session → post-auth
  destination, including the guest-claim relink) has never been executed. Only
  the send / resend / reject-bad-code branches were. **It could not have
  passed** before the fix in *B2 resolved* below: the form truncated the emailed
  code. Still owner-only to close (it needs a real inbox); the 5-step script is
  in that subsection.
- **B2** — **RESOLVED 2026-08-08.** The hook IS enabled and the code IS in the
  email. See *B2 resolved* below for the evidence and for the truncation defect
  it uncovered.
- **B3** — Auth OTP rate limiting uses `lib/rate-limit.ts`, which is
  per-serverless-instance and resets on cold start. `deploy:smoke` confirms the
  cross-instance Upstash limiter (`lib/rate-limit-kv.ts`) IS provisioned in
  prod. Moving auth onto it is a concrete, not speculative, follow-up.
- **B4** — `presentClaimOutcome` (`web/src/lib/talent/claim-outcome.ts`) is
  still English-only (zero locale references), so `/claim` renders localized
  chrome around English verdict copy for all 12 reasons.
- **B5** — The whitelabel tenant brand panel has no storefront imagery and no
  tenant accent: it is a near-black gradient whose upper ~55% is empty at
  1440px. It reads sparse rather than abandoned, but "kill dead space" is a
  standing quality bar, so this is unfinished rather than done.
- **B6** — Impronta has no uploaded logo, so its auth lockup is the letterspaced
  text wordmark fallback. **This is expected and correct behaviour**, not a bug:
  `resolveShellBrandLogoUrl` is live and wired: uploading at
  `improntamodels.com/admin/settings` → Branding & media swaps in the real logo
  on all auth pages with zero code change.
- **B7** — On a whitelabel host the auth footer's Terms / Privacy / Contact
  links point at `https://tulala.digital/...`, revealing the platform host from
  an otherwise fully agency-branded page. Arguably right (they are platform
  legal documents) but it is a whitelabel leak worth an explicit ruling.
- **B8** — PR **#1052** (branch `docs/auth-shell-domain-plan`) is still OPEN and
  `CONFLICTING`. Its entire body is *this file*, which #1062 brought onto
  `main`. It should be closed rather than merged, or `main` and the PR will
  diverge into two copies of the same document.

### B2 resolved (2026-08-08) — the code IS in the email, and the form was truncating it

**Answer: YES.** A visitor who requests a sign-in code today receives an email
that contains both the sign-in link **and** the numeric code. Four independent
checks, all read-only:

1. **Project config (Supabase Management API,
   `GET /v1/projects/pluhdapdnuiulvxmyspd/config/auth`):**
   `hook_send_email_enabled = true`,
   `hook_send_email_uri = https://app.tulala.digital/api/hooks/auth-email`,
   `hook_send_email_secrets` present (64 chars). No SMTP is configured
   (`smtp_host = null`), so the hook is not a fallback: it is the only path auth
   mail can take. The dashboard's own `mailer_templates_*` are therefore dead
   code for these actions, and nothing about `{{ .Token }}` in them matters.
2. **The secret is live in production.** `POST https://app.tulala.digital/api/hooks/auth-email`
   with an unsigned body returns **401 `{"error":{"http_code":401,"message":"Invalid signature"}}`**.
   That route returns **503 `Auth email hook not configured`** when
   `SEND_EMAIL_HOOK_SECRET` is unset, so 401 proves the env var is set in the
   Vercel production environment.
3. **The route renders the code.** `web/src/app/api/hooks/auth-email/route.ts`
   passes `email_data.token` into `renderTemplate`, which forwards it as `code`
   to `emails/auth/MagicLink.tsx` and `emails/auth/SignupConfirm.tsx`; both render
   it under `codeLabel` ("Or type this code where you asked for it:"). This
   shipped in **#1061 itself** (`caed735df`), so it is live wherever #1061 is.
   Password reset and email change stay link-only by design.
4. **The chain has actually delivered mail.** `notification_dispatch_log` holds
   two `auth.recovery` rows with `status = sent` and a Resend
   `provider_reference` (2026-06-15, EN and ES) — hook → route → Resend → log
   end to end. Caveat: **those are the only `auth.*` rows in the table.** Zero in
   the last 20 days, so nothing has exercised this path in ~2 months, and no
   `auth.magiclink` / `auth.signup` row has ever been written.

**Consequence: the code lane is the primary affordance and that is now honest.**
No copy change was needed to demote it.

**The defect this uncovered.** `mailer_otp_length = 8` on this project, but
`lib/auth/otp-flow.ts` hardcoded `OTP_CODE_LENGTH = 6` and `normalizeOtpCode`
did `.slice(0, 6)`. So an emailed `12345678` was truncated to `123456` before
`verifyOtp` ever saw it — the happy path failed **100% of the time** with "That
code did not work. Check the digits, or send a new code," and resending could
never help. A unit test even enshrined it
(`assert.equal(normalizeOtpCode("12345678"), "123456")`). Fixed: the module now
accepts the whole range Supabase can be configured to issue (6-10 digits), the
input's `maxLength` is 10, and no string on the screen promises a digit count
(`codeLabel` is "Code from your email", not "6-digit code") in EN or ES. The
`codeHint` now also names the emailed link as the alternative, so the way out
stays visible after a failed verify clears the "code sent" notice.

**Owner-only, 2 minutes, closes B1.** Not doable by an agent: it needs a real
inbox and a real session.

1. Open a private window on **`https://improntamodels.com/register?as=client`**
   (any host in `agency_domains` works; use one you can read mail for).
2. Enter an address you control and press **"Email me a sign-in code"**.
3. In the email, confirm you see the button *and* a numeric code, and **count the
   digits** — expected 8.
4. Type that code into the box on the still-open tab and press **Continue**.
5. Report: (a) how many digits the code had, (b) whether Continue signed you in
   and where it landed, (c) the exact error text if it did not. Then check
   `/platform/admin/email` for a new `auth.magiclink` or `auth.signup` row.

Optional owner config change (not required by the fix, and deliberately **not**
made by an agent): Supabase → Authentication → Emails → OTP length. Setting it to
6 would match the original copy, but the code now works at any setting.

### C. Phase-report claims this audit found to be wrong

- **P2 follow-up "the modal's `Got it` button is hardcoded English" is FALSE.**
  `talent-register-modal-copy.ts:121` already carries `gotIt: "Entendido"` in
  the `es` block (added in #903), and `talent-register-modal.tsx:445` renders
  `{t.gotIt}`. No work needed.
- **P2 follow-up "the host-blind talent post-auth default 404s on marketing" is
  effectively already mitigated.** The hidden `next` value is indeed host-blind
  (`/talent/profile/fields` on every host, and it does hard-404 on
  `tulala.digital`), but every redirect that consumes it —
  `auth/actions.ts:186`, `:328`, `auth/callback/route.ts:132`,
  `auth/otp-actions.ts:276`, `auth/password-actions.ts:55` — passes through
  `hostSafeRedirectDestination`, which rewrites a path the current host kind
  cannot serve to the same path on `getAppUrl()`. Worth a defensive test, not a
  P0.

### D. Claim flow — re-verified end to end at code level (no regression)

The freshly-shipped claim flow is intact:

1. `sendTalentClaimInvite` mails `/register?invitation=<id>&email=<e>`.
2. `(auth)/register/page.tsx` reads `?invitation=`; an **already-signed-in**
   visitor is `redirect()`ed straight to `/claim?invitation=<id>`, and an
   anonymous visitor gets `nextPath = /claim?invitation=<id>` threaded through
   signup. `resolveRegisterFlow` ranks `claim` above `?as=client`, verified live
   through the `/client/register` → `/register?as=client` redirect.
3. The invited address is prefilled (the RPC requires an exact match).
4. `(auth)/claim/page.tsx` calls `supabase.rpc("claim_talent_profile", …)`.

The RPC and its migration (`20260805232235_talent_profile_claim_linking.sql`)
and `claim-outcome.ts` were last touched by **#1012**, the original claim
shipment — no auth-program PR modified them. #1054's edit to
`claim/page.tsx` added only `getRequestLocale` + `createTranslator` and swapped
`admin-*` tokens for `plt-*`; it changed no redirect, guard or RPC call.

### E. Route × host matrix as measured in production (2026-08-08)

Identical on `tulala.digital`, `app.tulala.digital`, `improntamodels.com`
unless noted:

| Path | Status |
|---|---|
| `/login`, `/register`, `/forgot-password` | 200 |
| `/talent/register` | 308 → `/register?as=talent` |
| `/client/register` | 308 → `/register?as=client` |
| `/join` | 308 → `/register?as=talent` |
| `/claim` (no token, no session) | 307 → `/login` |
| `/update-password` (no recovery session) | 307 → `/forgot-password?notice=expired` |
| `/get-started` | 200 on `tulala.digital`; **404** on agency + app hosts (intentional) |
| `/es/login`, `/es/register`, `/es/forgot-password` | 200, `lang="es"` |
| `/es/talent/register`, `/es/join` | 308 but **locale lost** — defect A1 |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | 200 `application/json` (after the #1062 promote) |

Nothing 404s that should not.

### F. Highest-value next thing

**Fix A1.** It is the only defect in this program that a real user hits today,
it sits on the talent-acquisition funnel, the fix is a few lines against a
helper that already exists, and it is unit-testable without a browser.

After that, in order: B1+B2 together (one real OTP round trip settles both and
closes the last unproven auth branch), then B3 (cross-instance rate limiting on
auth), then B4 (localize the 12 claim verdicts).
