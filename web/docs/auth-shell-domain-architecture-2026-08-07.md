# Auth, Shells & Domains — Architecture Audit + Execution Plan (2026-08-07)

**Status: PROPOSED — needs owner sign-off on Decisions D1 + D2 below, then this
doc becomes binding for all auth-surface work.**

Owner prompt: the auth pages look disconnected from the marketing site and the
storefronts ("the design is very poor... dead ends always come"), and it is
unclear which domain should own authentication (`app.tulala.digital`?) versus
tenant domains and the marketing site — plus a future mobile app must let
talent/users enter quickly.

Honest scores today: **auth UX 3/10** (works; visually orphaned, five
inconsistent entry pages, recurring dead ends), **domain architecture 6/10**
(the host model is right; the execution is scattered). Target after this plan:
**8–9/10 with LESS surface to maintain than today.**

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
