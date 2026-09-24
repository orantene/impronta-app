# The talent journey, end to end (2026-09-23)

What a talent experiences from first contact to running their business, what
each step is built on, and **what is actually true today** versus what is
assumed.

Written after a night that took the talent free-website engine from "merged" to
"has served its first page", so the status column is measured rather than
inferred. Every "LIVE" below was checked with an HTTP request or a database
read on production, not from a merge commit.

Owners are the agent sessions that hold each lane. Nothing here is a plan for
work already owned elsewhere; it is the map the lanes share.

---

## The journey in one line

Register or claim → onboard → **profile live on the shared directory template**
→ *"activate your free website"* → **free site on a subdomain** → **upgrade to
Web Office** → run the business in the workspace.

---

## Step 1 — Registration, or claiming an invited profile

**Two entry points, and the second is the normal one.**

| | |
|---|---|
| Self-serve | `/register?as=talent` |
| Claim | an invited profile, via `/claim?invitation=<token>` |

Claim is not the edge case. Measured on production:

```
talent_profiles: 100 total, 90 with user_id NULL, 55 with invitation_email set
```

**Nine in ten talent profiles are unclaimed.** Seeding a talent and inviting
them to claim is how this platform actually onboards, so the claim path carries
the load and deserves the scrutiny.

**What it writes:** `talent_profiles.user_id`, `profiles.app_role`,
`profiles.account_status`.

### Status: BROKEN IN FOUR PLACES, three fixed

Found by walking it with a real invited profile:

1. post-auth dropped the invitation token — *fixed*
2. `/claim` was not registered as an auth-flow path — *fixed*
3. the claim RPC links `user_id` but **never sets `profiles.app_role`** — *in
   progress*
4. a talent who falls through lands on the legacy create-a-profile screen — the
   **duplicate-profile trap**

(3) is the dangerous one. A talent claims successfully, stays
`app_role='client'` / `account_status='onboarding'`, so `/talent` bounces them to
role selection, they pick "I'm Talent", and they are handed a *create a profile*
form — while already owning one. The happiest possible path ends in a duplicate.

*Owner: Jor Beauty session.*

---

## Step 2 — Onboarding

The talent fills in bio, photos, services with prices, location, availability.
Readiness is tracked as 8 items and surfaced as a percentage.

**Status: WORKS.** Jorgelina sits at 91%, one field outstanding.

---

## Step 3 — The profile goes live

The **shared directory template**, at `tulala.digital/t/<profileCode>`. Every
talent gets the same polished template — the directory is uniform by design. A
talent's bespoke design belongs on their *site* (step 5), not here.

**Status: LIVE and verified.**

```
https://tulala.digital/t/TAL-JORGBEAUTY   200
visible text: name, roles, location, bio, portfolio count, roster
```

### 3a — A DECISION THE OWNER MUST MAKE

**Classic hides every service for a free-tier talent. Maison shows them.**

`_light/LightProfileLayout.tsx`:

```ts
377:  const isFreePlan = !talentPlanKey || talentPlanKey === "talent_basic";
561:  {!isFreePlan && storefrontOfferings.length > 0 ? <TalentStorefront .../>
569:  : <ServiceMenuBlock items={isFreePlan ? [] : serviceMenuItems} .../>}
```

The storefront branch is skipped **and** the fallback is handed an empty array,
so a free talent shows no services, no prices, no category names. Nothing.
`MaisonProfileLayout` calls `publicOfferings()` unconditionally. Same props,
same data, opposite policy.

Measured on the same profile, same request, same catalogue:

| | visible chars | services |
|---|---|---|
| `?template=classic` | 1791 | none |
| `?template=maison` | 3164 | all 22, with MXN prices |

**Roughly half the rendered page is the catalogue.** This is a pricing decision,
not a bug: one of those templates is wrong and the owner decides which. The
argument that matters — the free tier now includes a whole public website, so
hiding the service list on the profile is internally inconsistent whichever way
it lands.

---

## Step 4 — "Activate your custom free website"

The callout on the profile/dashboard that turns a finished profile into a
website signup.

### Status: DOES NOT EXIST. Nobody owns it.

This is the connective tissue between a talent having a profile and a talent
having a site. Without it, step 5 is unreachable by anyone who is not told a URL.

---

## Step 5 — The free website

Their own site at `<name>.tulala.digital`, built from their profile, edited in
the real page builder with lock chips on paid controls.

**Free tier gets:** pick and switch Design, colours and fonts, edit text and
images, logo, show/hide/reorder, republish.

### Status: THE ENGINE WORKS. Proven tonight, for the first time.

Before tonight, `talent_pages` held **zero rows across all of production** — the
engine had never rendered a page for anyone, ever.

```
https://tulala.digital/t/site/qa-tester-sept    200
https://qa-tester-sept.tulala.digital           200
343 visible chars, every authored block rendering, both containers, order kept
```

Getting there required fixing three things, at three different layers, each of
which produced an identical 404:

1. **`app/_talent-site/` was a private folder.** Next.js excludes any
   `_`-prefixed directory from routing, so the proxy rewrote into a route that
   did not exist. Every talent custom domain and subdomain had been dead for as
   long as the folder had that name. Renamed to `%5Ftalent-site` — the encoded
   underscore keeps the public path identical.
2. **The starter tree's top-level block was a `section`.** `shouldRenderNode`
   returns false for a top-level section before it looks at children, so a
   freshly provisioned page was judged EMPTY and answered 404 while the
   dashboard showed it published. Changed to `container`.
3. **Provisioning hard-coded the Max tier**, so free-site *creation* was
   impossible for anyone — while every read-time gate had already moved to the
   capability matrix, which grants `talent_basic` both `personalSiteEdit` and
   `personalSitePublish`.

**The one that should worry us most:** the test plan asserted *"custom domain
returns 404"* as the **expected** result in two journeys. Those tests passed, and
would have passed forever, certifying the bug. That is the argument for running
things in a browser rather than trusting green unit tests, made concrete on our
own code.

### Known defect, cosmetic but corrosive

The publish **dialog's checks panel** is agency-scoped. It calls
`cms-seo-actions.ts`, which gates on `requireTenantScope()` and returns *"Pick an
agency workspace first."* for a talent with no agency. The talent then sees a red
error and *"Last published: —"* that never resolves — **and publishes
successfully anyway.** The publish action itself is correctly wired to
`publishTalentPageAction`. A scary error over a working button teaches a talent
not to trust the button.

Also: the builder paints *"Start from scratch — nothing goes live until you
publish"* over a page that HAS content, for several seconds, while it loads. An
empty state used as a loading state reads as "my work is gone".

---

## Step 6 — Upgrade to Web Office

One paid tier. **Web Office**, plan key `talent_portfolio`, $15/mo, 14-day trial.
Pro folds into it; existing Pro subscribers keep their perks.

**Adds:** extra pages, new sections, custom domain, SEO, analytics, custom CSS
and motion, badge removal.

**How the tier is actually granted:**

```sql
talent_profile_has_max(profile_id)
  -> SELECT EXISTS (... WHERE tp.talent_plan_key = 'talent_portfolio')
```

No subscription table, no Stripe join. Setting `talent_plan_key` opens every Web
Office gate immediately. Useful for comps and fixtures — and worth recording the
reason on the row, because nothing else will ever say why that talent is on a
paid tier with no subscription behind it.

### Status: THE TIER WORKS. THE UPGRADE EXPERIENCE DOES NOT EXIST.

Phase 4 — the upgrade dialog, the 14-day trial, lapse handling, look/design
switching from the builder rail — was never built. A lapsed plan is supposed to
*degrade* the site (home only, domain paused) rather than 404 it; the
custom-domain half of that shipped (`20261231282000` makes
`talent_site_domain_lookup` require Web Office), the rest did not.

---

## Step 7 — Running the business

The workspace: Today, Messages, Calendar, Money, Profile, Public page, Services,
Reviews. Plus POS and the agency-workspace features.

### Status: UNTESTED FOR TALENT.

Nobody has driven these screens as a talent. They were built for agency
workspaces and the talent surface reuses them, which is exactly where the
publish-dialog defect above came from — an agency-scoped component mounted on a
talent surface. Expect more of that shape.

---

## What is live right now

| | |
|---|---|
| Phases 0, 1, 2, 5, Q | merged and deployed |
| Migrations | 865 applied |
| Feature switches | all three ON in production |
| `*.tulala.digital` | attached, valid TLS, resolves |
| `deploy:smoke` | exit 0 |

Switches: `TALENT_THEME_GALLERY_ENABLED`, `TALENT_FREE_WEBSITE_ENABLED`,
`TALENT_SITE_SUBDOMAINS_ENABLED`. All are **Production-scoped**, so they read OFF
on Preview hosts and a free talent's site will 404 there. That is flag scope, not
a bug — do not chase it.

---

## The gaps, in the order they block the journey

1. **Claim sets no role** (step 1) — duplicate-profile trap on the happy path.
   *Owned, in progress.*
2. **The activate callout does not exist** (step 4) — **unowned**. Without it
   the free website is unreachable.
3. **The free/paid services ruling** (step 3a) — **owner decision**, blocking
   nothing technically and everything presentationally.
4. **Web Office upgrade, trial and lapse** (step 6) — Phase 4, never built.
5. **Talent workspace and POS unproven** (step 7).

Steps 3, 5 and 7 exist. **Steps 1, 4 and 6 are the gaps, and they are exactly the
connective tissue: getting in, being invited to upgrade, and paying.**

---

## A note on method

Four findings tonight were wrong on first measurement and corrected: RSC payload
read as rendered content, a four-minute deploy window read as alias drift,
agency tables read as a talent publish, and a stale `deploy:smoke` checkout read
as a product defect. Each was true about the wrong subject.

The checks that did not lie: **strip the tags and count visible characters**, and
**read the columns the code actually reads**. Grepping HTML finds a client
island's serialised props and calls them content.
