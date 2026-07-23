# PR-BRAND — Tagline swap, logo descriptor, hero headline

**Task ref:** Audit items **A4** (deploy positioning) and **A5** (hero value message).
**Depends on / coordinates with:** `PR-BILINGUAL.md` explicitly names A4 as a dependency for the homepage `<title>` — read §6 below before touching `/` metadata in that PR.
**Status:** SPEC — every string below is final copy, ready to paste. No component needs new plumbing beyond one new copy key and one new prop (both detailed below).

This spec is copy-ready and repo-grounded. Every file path, line, and current string was read directly from `/Users/oranpersonal/Desktop/impronta-seo/web` on 2026-07-22. Nothing here invents a feature, price, or claim — it only changes how the existing product is named.

---

## 0. The three messages (read this first — governs every section below)

Three separate strings, three separate jobs. **Never put two of them on the same screen.**

| # | Message | Job | Lives here | Must NOT appear here |
|---|---|---|---|---|
| 1 | **"The Commerce Platform for Talent"** (ES: *"La Plataforma de Comercio para el Talento"*) | Category — what Tulala **is** | Logo descriptor (header + footer), `<title>` brand suffix, OG/Twitter title, Organization schema `description` | As a hero headline — it's a category label, not a pitch, and reads flat/abstract at H1 size |
| 2 | **"Your Business. Your Brand. Your Bookings." / "All in one place."** | Value — what you **get** | Homepage hero H1 only (`hero-section.tsx`) | Anywhere else. Sub-pages (`/operators`, `/agencies`, `/organizations`) keep their own audience-specific H1s — do not paste this in as a generic headline |
| 3 | *"Your Talent. Your Business. Your Digital World."* | Vision — the emotional arc | About page, campaign banners, social bios — **not built in this PR**, listed here only so nobody invents a fourth message later | Homepage hero (competes with #2); don't sprinkle it into body copy as filler |

This PR ships #1 and #2. #3 has no target surface yet in this repo (there is no `/about` page) — leave it out; do not create a page for it as a side effect of this task.

**Why this matters for review:** the homepage today literally puts a version of message #1 in three places on one screen (header wordmark area, hero eyebrow, footer description) — see §5. Landing this PR without touching the hero eyebrow leaves that triple-repeat in place with an *extra* copy of #1 now living in the header too. §5 flags the exact fix but keeps it out of the required diff per the task's "don't rewrite all copy" instruction — reviewer should decide whether to fold it in.

---

## 1. Tagline change — `TULALA_BRAND.tagline`

**File:** `web/src/lib/brand/tulala.ts`

```diff
   /** Primary positioning line — one sentence, no period in buttons. */
-  tagline: "The Talent Business Platform",
+  tagline: "The Commerce Platform for Talent",
```

This constant is English-only today (no locale variant exists anywhere in the `TULALA_BRAND` shape) and every one of its call sites is also English-only rendering. That matches the current site behavior — the audit already tracks "metadata is English-only" as a separate finding (item 7 / `PR-BILINGUAL.md`). **Do not add a locale branch to `TULALA_BRAND.tagline` in this PR** — that's `PR-BILINGUAL`'s job, coordinated in §6 below. This PR just swaps the one EN string.

### 1a. Everywhere `PLATFORM_BRAND.tagline` flows (grep-verified, `web/src/app/**`)

| Site | File : line | Current render | After this change |
|---|---|---|---|
| Root `<title>` default | `src/app/layout.tsx:102` | `Tulala — The Talent Business Platform` | `Tulala — The Commerce Platform for Talent` |
| Root OG title | `src/app/layout.tsx:117` | same | same |
| Root Twitter title | `src/app/layout.tsx:124` | same | same |
| Marketing-branch `<title>`/OG/Twitter (homepage `generateMetadata`, `ctx.kind === "marketing"`) | `src/app/page.tsx:169` | `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}` | same pattern, new tagline |

All four sites interpolate the same constant with the same `"{name} — {tagline}"` template — one edit in `tulala.ts` propagates to all four with zero template changes. `PLATFORM_BRAND` (`src/lib/platform/brand.ts`) is a pure re-export of `TULALA_BRAND`, so no second edit is needed there.

**"Confirm none break" check:**
- **Length:** old string is 38 chars, new is 42 chars. `Tulala — The Commerce Platform for Talent` = 43 chars total including brand name — well inside Google's ~60-char title guidance and Twitter/OG's practical limits. No truncation risk.
- **No template placeholders assume old wording** — grepped `layout.tsx` and `page.tsx`, confirmed both just do straight string interpolation, nothing pattern-matches on the tagline text itself (e.g. no `.includes("Talent Business")` logic anywhere in the codebase — verified via repo-wide grep).
- **Sub-page titles unaffected** — the `title.template: "%s · Tulala"` in `layout.tsx` only appends the bare brand name, never the tagline, so every non-homepage `<title>` (`/pricing`, `/faq`, etc.) is untouched by this change.
- **`og:site_name` unaffected** — `layout.tsx` sets `openGraph.siteName: PLATFORM_BRAND.name` (`"Tulala"`, not the tagline). That's correct as-is per OG convention (site_name = brand name, not full tagline) and needs no change here, despite the audit's summary table grouping "OG site_name/description" together — site_name specifically should stay just `"Tulala"`.

### 1b. Adjacent field also named in the audit table — `PLATFORM_BRAND.description` (OG/Twitter **description**, not title)

**File:** `web/src/lib/brand/tulala.ts`

Current:
```ts
description:
  "Tulala is the operating system for talent businesses — a branded storefront, a structured booking pipeline, and the shared discovery network that sends new work your way.",
```

This is the string that actually fills `og:description` / `twitter:description` on the root layout (`layout.tsx:105,118,125`) and on the homepage marketing branch (`page.tsx:172,175,182`) — i.e. the other half of what the audit table meant by "OG site_name/description." It has an em dash (violates the no-em-dash rule, and the audit separately flags this exact string). Since this PR is already touching every tagline call site and the audit explicitly names OG description in the same table row as the tagline, fix it here rather than leave a fresh contradiction (new category name in the title, old "operating system" phrasing one line below in the description):

```diff
   description:
-    "Tulala is the operating system for talent businesses — a branded storefront, a structured booking pipeline, and the shared discovery network that sends new work your way.",
+    "Tulala is the commerce platform for talent: a branded storefront, a structured booking pipeline, and the shared discovery network that sends new work your way.",
```

No feature claims changed — same three nouns (storefront, booking pipeline, discovery network) that are already live on the product. Only the connector changed (em dash → colon) and the opening clause now matches the new category name instead of the retired "operating system" phrasing.

`PLATFORM_BRAND.positioning` (`"Software for talent businesses."`, used only in the footer copyright line) does **not** contain the old tagline text verbatim and does not contradict the new one — leave it untouched, out of scope.

---

## 2. Logo descriptor — header + footer

Add one new copy key (locale-aware, since header/footer already have locale plumbing), then two small JSX additions.

### 2a. New copy key — `web/src/lib/marketing/copy.ts`

Insert as a new top-level key in **both** the `en` object and the `es` object, right after `nav` closes and before `hero:` starts (EN: after line 90's closing `},`, before line 93's `hero: {`; ES: the mirrored position after the `es.nav` block closes, before `es.hero`):

```diff
     accountSettings: "Account settings",
   },
+
+  /** Logo lockup descriptor — header (desktop) + footer (always). Category
+   *  message only; never the hero headline. See PR-BRAND §0. */
+  brand: {
+    descriptor: "The Commerce Platform for Talent",
+  },

   hero: {
     eyebrow: "The talent business platform",
```

ES block (mirrored position):

```diff
     accountSettings: "Configuración de cuenta",
   },
+
+  brand: {
+    descriptor: "La Plataforma de Comercio para el Talento",
+  },

   hero: {
     eyebrow: "La plataforma del negocio del talento",
```

Because `MarketingCopy` is typed as `typeof en` and `es` is typed `MarketingCopy`, TypeScript will fail the build if either language is missing the key — no silent English-only fallback possible.

### 2b. Header — `web/src/components/marketing/header.tsx`

`MarketingHeader` already computes `const copy = getMarketingCopy(locale);` (line 81) and renders the logo via a private `TulalaHeaderLogo()` helper (line 755) that currently takes no props. Thread the descriptor through:

```diff
-          <TulalaHeaderLogo />
+          <TulalaHeaderLogo descriptor={copy.brand.descriptor} />
```

```diff
 /**
  * Header lockup — the canonical mark + monoline wordmark from
  * `@/components/brand/tulala-logo`. Letter strokes ride `currentColor`
  * (ink-strong here); the full-stop carries the brand orange.
+ *
+ * `descriptor` renders the category-message lockup line to the right of
+ * the wordmark, desktop-only (xl+ — one step past the `lg:` breakpoint the
+ * nav itself switches on at, so the label never competes with nav for
+ * space; QA at 1024–1280px and drop to a wider breakpoint if it still
+ * crowds). ~60% opacity, one weight lighter than the wordmark, letter-
+ * spaced small-caps-style — never a second dark bold element in the bar.
  */
-function TulalaHeaderLogo() {
+function TulalaHeaderLogo({ descriptor }: { descriptor: string }) {
   return (
-    <span style={{ color: "var(--plt-ink-strong)" }}>
+    <span className="inline-flex items-center gap-3" style={{ color: "var(--plt-ink-strong)" }}>
       <TulalaLogo wordmarkHeight={25} />
+      <span
+        aria-hidden
+        className="hidden whitespace-nowrap pt-px text-[0.625rem] font-medium uppercase tracking-[0.13em] xl:inline-block"
+        style={{
+          color: "var(--plt-ink-strong)",
+          opacity: 0.6,
+          borderLeft: "1px solid var(--plt-hairline-strong)",
+          paddingLeft: "0.75rem",
+        }}
+      >
+        {descriptor}
+      </span>
     </span>
   );
 }
```

Notes:
- `hidden … xl:inline-block` (not `lg:`) is deliberate — `NAV` itself switches from hamburger to full desktop nav at `lg:flex` (line 174 area). Gating the descriptor to the *same* breakpoint risks it fighting the nav for width right at the point nav first appears. `xl:` (1280px+) gives the descriptor a lane only once there's headroom. If visual QA at 1280–1440px still shows crowding against the widest nav dropdown label, bump to `2xl:` — do not shrink nav labels to force the descriptor to fit.
- `opacity: 0.6` sits in the requested 55–65% band. `font-medium` (vs. the wordmark's implicit bold weight) satisfies "one weight lighter."
- Uses a hairline vertical divider (`var(--plt-hairline-strong)`, already used elsewhere in this file for the scrolled-header border) instead of a second line — keeps the lockup to the header's fixed height, no wrap risk.
- `aria-hidden`: the wordmark's parent link already carries `aria-label={`${PLATFORM_BRAND.name} — home`}` (line 169) for the accessible name; the descriptor is decorative-supplemental, not a second accessible name, so it's hidden from the tree the same way the wordmark SVG itself is (`aria-hidden` in `tulala-logo.tsx`).

### 2c. Footer — `web/src/components/marketing/footer.tsx`

`MarketingFooter` already computes `const copy = getMarketingCopy(locale).footer;` (line 27) for the footer-scoped copy — add `.brand.descriptor` alongside it (top-level key, not nested under `footer`):

```diff
   const copy = getMarketingCopy(locale).footer;
+  const brand = getMarketingCopy(locale).brand;
```

```diff
             <div className="flex items-center" style={{ color: "var(--plt-ink-strong)" }}>
               <TulalaLogo wordmarkHeight={24} />
             </div>
+            <p
+              className="mt-2 text-[0.625rem] font-medium uppercase tracking-[0.14em]"
+              style={{ color: "var(--plt-muted)" }}
+            >
+              {brand.descriptor}
+            </p>
             <p
               className="mt-5 text-[0.9375rem] leading-[1.6]"
               style={{ color: "var(--plt-muted)" }}
             >
               {copy.description}
             </p>
```

Footer descriptor renders at **every** breakpoint (no `hidden`/responsive gating) per the brief — it sits under the wordmark in the one-column mobile stack the same as desktop, so there's no nav-crowding constraint here the way there is in the header.

---

## 3. Hero headline — "Your Business. Your Brand. Your Bookings." / "All in one place."

**File:** `web/src/lib/marketing/copy.ts`, `hero.titleLine1` / `hero.titleLine2` (EN block ~line 95, ES block ~line 442).

### 3a. Exact string edits

```diff
   hero: {
     eyebrow: "The talent business platform",
-    titleLine1: "Your talent and services",
-    titleLine2: "worth money.",
+    titleLine1: "Your Business. Your Brand. Your Bookings.",
+    titleLine2: "All in one place.",
     subhead:
```

```diff
   hero: {
     eyebrow: "La plataforma del negocio del talento",
-    titleLine1: "Tu talento y tus servicios",
-    titleLine2: "valen dinero.",
+    titleLine1: "Tu Negocio. Tu Marca. Tus Reservas.",
+    titleLine2: "Todo en un solo lugar.",
     subhead:
```

`subhead` (the longer paragraph below the H1) is unchanged in both locales — it's not part of the brand-critical headline strings this task scopes, and it still reads correctly under the new H1 (it already stands as an independent sentence, doesn't grammatically continue the old headline).

### 3b. Why this fixes the "run-on H1" finding without touching `hero-section.tsx`

The old H1 was one sentence artificially split across two `<span className="block">` lines — `titleLine1` = "Your talent and services" / `titleLine2` = "worth money." — which is what made it read as a run-on when the two spans wrap independently at different widths. The new copy is **two complete, independently-meaningful lines by construction**: line 1 is three short declarative sentences ("Your Business. Your Brand. Your Bookings."), line 2 is a standalone closer ("All in one place."). This maps onto the *existing* two-`<span>` structure in `hero-section.tsx` (lines 103–119) with **no component changes required** — `titleLine1` still renders in the plain-color span, `titleLine2` still gets the gradient-text treatment (the visual "highlight the payoff line" pattern already built). Ship this as a copy-only PR.

**One thing to verify visually, not fix blind:** `titleLine1` is longer now (44 chars vs. 25). At the hero's current H1 sizing (`text-[3rem] … sm:text-[4.25rem] lg:text-[5.25rem]`, `max-w-[40rem]` container), "Your Business. Your Brand. Your Bookings." will wrap onto 2 visual lines on narrower viewports even though it's one `titleLine1` string/one `<span className="block">`. That's expected and fine — `block` already wraps naturally; it is not the run-on problem (the run-on was semantic, not a line-wrap issue). Do a real-viewport pass at 375px/768px/1440px and confirm line breaks land on natural phrase boundaries ("Your Business." / "Your Brand. Your Bookings." or similar) — if a break lands mid-sentence in a way that reads badly at a specific width, that's a font-size/max-width tuning call for whoever does visual QA, not a copy change.

### 3c. Hero eyebrow — flagged, not included in this diff (see §0 and §5)

`hero.eyebrow` currently hardcodes the *retiring* tagline text verbatim ("The talent business platform" / "La plataforma del negocio del talento") — it is not driven by `TULALA_BRAND.tagline`, so changing the constant in §1 does **not** update it. Left as-is, the homepage will read: header descriptor "The Commerce Platform for Talent" → hero eyebrow "The talent business platform" one screen below it — two different category taglines stacked in the same viewport. See §5 for the full triple-repeat picture and a recommended (not mandated) fix.

---

## 4. `hero-section.tsx` — confirm no changes needed

Read in full (`web/src/components/marketing/hero-section.tsx`, 289 lines). Confirmed:
- Lines 103–119: H1 markup already renders `titleLine1` and `titleLine2` as two separate `<span className="block">` elements, second one gradient-filled. Copy-only change from §3a is sufficient.
- Nothing else in this file references `hero.titleLine1`/`titleLine2`/`eyebrow` text by content (no length-based conditionals, no truncation logic) — safe to swap.
- `subhead`, `ctaTalent`, `ctaBusiness`, `trust` render unchanged below the H1 — this PR doesn't touch them.

**No code change to `hero-section.tsx` is required for this task.** If §3c's eyebrow fix is folded in by the reviewer, that's still copy-only (the `<span className="plt-eyebrow …">{copy.eyebrow}</span>` at line 96–101 already just renders whatever string is in `copy.eyebrow`).

---

## 5. Adjacent findings — same retiring string, found while tracing "every place the tagline flows"

Grep for the literal retiring phrase (`"talent business platform"`, case-insensitive) across `src/`, cross-referenced against what §1–3 already cover:

| # | File : line | Current string | In this PR's diff? | Recommendation |
|---|---|---|---|---|
| 1 | `src/lib/brand/tulala.ts:33` | `tagline: "The Talent Business Platform"` | **Yes** — §1 | — |
| 2 | `src/lib/marketing/copy.ts:94` (EN) / `:441` (ES) | `hero.eyebrow: "The talent business platform"` | **No** — flagged §3c | Sits directly below the header once §2 ships. Recommend replacing with an audience-neutral eyebrow (not a re-statement of message #1 or #2 — see §0) in a fast follow, e.g. EN "For independent talent, agencies, and hubs" (ES equivalent) — descriptive of who the page serves, doesn't duplicate the header descriptor or the new headline. Not specified as a required edit here per the task's "don't rewrite all copy" scope; flagging so it isn't shipped forgotten. |
| 3 | `src/lib/marketing/copy.ts:331` (EN) / `:677` (ES) | `footer.description: "The talent business platform — sell your services, run your business, get paid."` | **No** — flagged here | Same collision as #2, one level worse: this string sits in the **same footer column** as the new descriptor from §2c, so it would literally repeat message #1 twice in six lines of footer, and it still has the em dash the project's copy rule forbids. If folding in, suggested replacement — EN: `"Sell your services, run your business, and get paid, all on one platform."` / ES: `"Vende tus servicios, lleva tu negocio y cobra, todo en una sola plataforma."` (no em dash, no repeated category name, keeps the same three real product claims — services storefront, business operations, payments — that are already true and already stated elsewhere on the page). |
| 4 | `src/app/(auth)/layout.tsx:151` | `` `© ${year} Tulala. The talent business platform.` `` | **No** — flagged here | Auth-flow footer (login/signup chrome), English-only, literal string (not the constant). Purely cosmetic/legal-line context, low visibility, but will read stale once the rest of the site says "Commerce Platform for Talent." Cheapest fix if picked up: swap the trailing clause to `"The Commerce Platform for Talent."` — one-line edit, same file. |
| 5 | `src/app/onboarding/layout.tsx:83` | `© {year} Tulala. The talent business platform.` | **No** — flagged here | Same pattern as #4, onboarding-flow footer. Same fix if picked up. |
| 6 | `src/app/(marketing)/operators/page.tsx:145` | `` `${PLATFORM_BRAND.name} is the talent business platform for coordinators, freelance scouts, managers, and one-person agencies. Get a polished storefront, a structured inquiry inbox, and exposure on a shared discovery network — free to start.` `` | **No** — out of scope | This is body/hero copy for the `/operators` page, not a rendering of the tagline constant — it uses the phrase descriptively mid-sentence and also carries an em dash. It's a Phase-B/general copy-and-em-dash-sweep item (the audit's 450+ em dash finding), not a brand-lockup string. Left alone here; do not touch as a side effect of this PR. |

**Recommendation to the implementer:** ship §1–4 (required) as the PR. Rows 2–3 above are a genuine same-screen contradiction the moment §2's header/footer descriptor lands, so strongly consider folding those two specific one-line edits into the same commit even though the task scoped this spec to "just the brand-critical strings" — they're the same string being retired, just duplicated outside the constant. Rows 4–5 are safe to leave for a follow-up (low-traffic auth chrome, not marketing-surface, not indexed). Row 6 is explicitly out of scope.

---

## 6. Coordination note for `PR-BILINGUAL.md`

`PR-BILINGUAL.md` (§1, `/` homepage row) already anticipates this PR and lists two candidate ES `<title>` strings:

```
ES (post-A4 tagline, use this if A4 is merged first): `Tulala: la plataforma de comercio para el talento`
```

That string is **sentence-case with a colon** — correct for a `<title>` tag rendering pattern (`"Tulala: <lowercase tagline>"`), and it does **not** conflict with this PR's descriptor string (`"La Plataforma de Comercio para el Talento"`, **title case, no "Tulala:" prefix**) because they're different renderings for different surfaces:

- **This PR's `brand.descriptor`** → visual logo-lockup label sitting right next to/under the wordmark, which already supplies the brand name graphically. Title case reads as a lockup line (similar register to "The Commerce Platform for Talent" in EN).
- **`PR-BILINGUAL`'s ES `<title>`** → a `<title>` tag, which conventionally interpolates brand name + sentence-case description, matching how the current EN `<title>` template already works (`Tulala — The Commerce Platform for Talent`, sentence case after the em dash/colon).

No action needed to reconcile them — just don't copy one string into the other's slot. If whoever picks up `PR-BILINGUAL` wants the exact ES tagline word-for-word instead of writing their own `<title>`-cased version, the source-of-truth string is this PR's `TULALA_BRAND.tagline` English value translated the same way: `"La Plataforma de Comercio para el Talento"` → title-cased for the lockup, sentence-cased (`"la plataforma de comercio para el talento"`) if reused inside a `<title>` string.

---

## 7. Verification checklist (post-implementation)

- [ ] `tulala.ts`: `tagline` and `description` updated; `npx tsc --noEmit` clean (no type breaks — both are plain string literals).
- [ ] Live `<title>` on `/` reads `Tulala — The Commerce Platform for Talent`.
- [ ] View-source `og:title`, `og:description`, `twitter:title`, `twitter:description` on `/` match the new strings; `og:site_name` still bare `Tulala`.
- [ ] Header, desktop ≥1280px: descriptor visible right of wordmark, doesn't wrap, doesn't crowd nav. Header 1024–1280px: descriptor correctly hidden (no partial/clipped render). Header mobile: descriptor absent, wordmark unaffected.
- [ ] Footer, all breakpoints: descriptor renders directly under wordmark, above the description paragraph, correct locale string on `/es`-cookied session.
- [ ] Homepage H1: `titleLine1` + `titleLine2` render as two lines, gradient still applied to line 2 only, no visual regression in `mkt-rise` animation stagger.
- [ ] 375px / 768px / 1440px screenshot pass on the new H1 — confirm no awkward mid-word/mid-phrase break.
- [ ] ES locale (`/` with ES cookie or `?lang=es`): hero H1 reads "Tu Negocio. Tu Marca. Tus Reservas." / "Todo en un solo lugar.", header/footer descriptor reads "La Plataforma de Comercio para el Talento".
- [ ] No em dash introduced anywhere in this diff (grep the diff for `—`/`—` before commit).
- [ ] If §5 rows 2–3 (hero eyebrow, footer description) were folded in: confirm the homepage no longer shows message #1 more than once per §0's rule.
