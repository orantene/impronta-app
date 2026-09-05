# Directory & Profile Engine — production browser QA, 2026-09-05

Owner's order: hardcore browser QA on everything guest-reachable in production.
Real Chromium at 1440x900 against live production. Every row below was loaded and
executed, not curled.

**Deploy state during this pass:** production pointer at `74db76a56`. PR #1733 is
NOT deployed (see row 4 — it should not be).

## Result

| # | Surface | Verdict |
|---|---|---|
| 1 | `/global-directory` — render, hydration, search, filters, modal, pagination | **FAIL** (3 defects) |
| 2 | Three public profile pages incl. one claimed | **PASS** |
| 3 | Two `/w/` tenants + El Paisa + Impronta — hydration | **PASS** |
| 4 | Guest dock reads the full business name on El Paisa | **PASS — already correct without #1733** |

The SEV-1 shape is absent everywhere: zero `must be used within` throws, zero
error boundaries, zero console errors on all seven surfaces.

## A measurement note that matters

The in-app browser pane reported `document.visibilityState: "hidden"`, which
makes `innerText` return 0 and screenshots blank **on a page whose `textContent`
is 288,151 characters and whose `<main>` is 1427px tall with 14 images**. A blank
screenshot and an empty `innerText` both looked exactly like a dead page. They
were a dead *compositor*.

Everything below was therefore re-measured in real headless Chromium. This is the
same class as the recorded SEV-1 in reverse: there, every server signal said
healthy and only a browser saw the failure; here, the browser surface said dead
and the page was fine. **Name the referent: "the page is blank" and "my capture
of the page is blank" are different claims.**

---

## FAIL 1 — 29 of 53 publicly listed talents are unreachable

`/global-directory` prints **"53 profiles"** and renders **24**.

Verified by DOM count, not by eye: 24 unique `a[href^="/t/"]`. There is no
load-more or next control on the page (`Show all 10` belongs to the *city* facet),
and ten consecutive scrolls to `document.body.scrollHeight` added zero cards.

More than half the roster — including talent who chose to be listed — cannot be
reached by any guest, on the page whose entire purpose is to surface them.

Highest-severity finding of this pass.

## FAIL 2 — the country facet splits on accents, and the filter cannot cross the split

The facet renders `Mexico (43)` and `México (4)` as two separate options.

Mechanism, in `discover.ts`:

```js
const key = country.toLowerCase();   // folds CASE, not diacritics
```

Case is folded, so a third live spelling — `mexico` (2 profiles) — merges
silently. Diacritics are not, so `México` becomes a rival option. The filter then
uses `.ilike()`, which is case-insensitive and accent-**sensitive**.

Measured impact, disjoint sets:

| query | cards |
|---|---|
| `?country=Mexico` | 24 |
| `?country=México` | 4 |

A buyer filtering to Mexico never sees those 4 talents, and nothing on screen
suggests a second Mexico exists.

Live data behind it (`home_country_text`, globally listed): `Mexico` 26,
`México` 4, `mexico` 2.

Root cause is structural: `home_country_text` / `home_city_text` are free text
sitting beside `residence_country_id` / `residence_city_id`, which are foreign
keys into a `countries` table that contains exactly **one** Mexico row. Two
stores for one fact, and the directory reads the unvalidated one.

## FAIL 3 — the city facet pairs cities with countries they are not in

Visible on the live page right now:

- `Buenos Aires, Mexico` (1)
- `Playa Del Carmen, Argentina` — rendered on a talent card
- `Playa Del Carmen, Mexico` (33) / `Playa Del Carmen, México` (4) / `Playa Del Carmen` (2)
- `Cancun, Mexico` (4) / `Cancun` (1)

The city label is composed from two independent free-text fields, so a bad pair
renders as confidently as a good one. Same root cause as FAIL 2.

## Lesser defects on the profile modal (public)

Found while checking modal copy on a business vs a talent:

- `PRONOUNS: she_her` — a raw enum key shown to the public; should be "She/her".
- `HEIGHT 160`, `BUST 80`, `WAIST 60`, `HIPS 58` — no units anywhere.
- `Based in: Playa del Carmen · FEE` — a dangling separator and a `FEE` label
  with no amount, repeated for every travel row.
- `DETAILS` heading renders twice; `53 profiles` also renders twice.
- Two cards carry no craft at all (`Chris Rosillo`, `Eli`).

## PASS 2 — three public profile pages

| profile | status | inquiry opens | console errors |
|---|---|---|---|
| `TAL-92120` loba (**claimed**) | 200 | yes | 0 |
| `TAL-00035` Annher | 200 | yes | 0 |
| `TAL-92065` agus | 200 | yes | 0 |

The claimed profile behaves identically to unclaimed ones, which is the intended
outcome of the claim flow proven on 2026-09-04.

## PASS 3 — hydration survives on every tenant shape

| surface | status | text | boundary | provider throw |
|---|---|---|---|---|
| `/global-directory` | 200 | 3.6k | no | 0 |
| `elpaisa.tulala.digital` (host tenant) | 200 | 144 | no | 0 |
| `/w/travelpathshuttle` (path tenant) | 200 | 903 | no | 0 |
| `improntamodels.com` (host tenant) | 200 | 5.8k | no | 0 |

Both storefront fixes hold in production. This is the first time the `/w/` fix
has been confirmed on a served build rather than inferred from the merge.

**Open item, not a regression:** El Paisa renders 144 characters, zero images and
zero `<section>` elements — an empty storefront whose only copy is
`Agency-managed discovery and representation`, on a tenant whose
`industry_preset` is `restaurant`. The preset is not reaching the storefront
words. Front Door's area, raised not fixed here.

## PASS 4 — and why #1733 must not merge

El Paisa's guest dock reads, in production, today, without #1733:

> Start a new inquiry
> **Tell El Paisa's team what you need**

Full business name. Correct already.

My commit message for #1733 asserted this line read "Tell El's team what you
need" on El Paisa. It does not, and it cannot:

- `GuestDockHomeView` (the only file #1733 edits) is imported from exactly one
  place, `MiniChatPanelColumn.tsx:475`, under `app/t/[profileCode]/`. It renders
  only on a **talent profile** page.
- El Paisa's storefront dock is a different component that already passes the
  full agency name. Same sentence, same i18n key, different tree.
- **El Paisa has zero talent profiles** (`created_by_agency_id` count = 0; only
  `impronta` has any). No `/t/` page exists under El Paisa at all.

`/t/` pages are people — the live multi-word names there are Chris Rosillo, Ines
Oussaifi, Luna Alvarez — and on a person the first-name split is the *desirable*
behaviour: the launcher reads "Inquire about Chris". #1733 would make that
"Chris Rosillo" on the only surface it can affect, to fix a business case that
cannot arise there.

Recommended: **close #1733.** Held with the Platform Features merge loop.

## Owed

- Fix FAIL 1 (pagination) — largest guest-visible loss on the platform.
- Fold diacritics in the facet key and in the filter predicate; then converge
  `home_*_text` onto the `locations` / `countries` foreign keys so the free-text
  store stops being the one the directory reads.
- Modal copy pass: pronoun labels, units, empty `FEE`, duplicate headings.
