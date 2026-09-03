# Front Door plan

Owner: Front Door Manager. Reports to the Platform Features Director.
Scope: everything a guest or a registered client touches on a tenant's public site, on every business type.

Vision: "Sell the Room" sections 05c, 05d, 05f — https://claude.ai/code/artifact/871b8720-ae26-4f49-b9a4-c18a45676a99
Mockups canvas: https://claude.ai/code/artifact/801a67c7-2c74-4304-9b6a-283e28b27b9c
My artboards there: `CheckoutSheet`, `Receipt`, `MeHome`, `ReserveFlow`, `ScanLanding`, `SettingsWords`, `SettingsWordsPadel`, `SettingsPresets`.

Last updated: 2026-09-02. Status: plan written, verification pass complete, F1 and F2 have their go from the board (Wave A).

---

## 1. Verification pass against origin/main (2e2868ef3)

Every claim in the brief was re-checked against `origin/main`, not taken on trust. Result: **the brief is substantially accurate**. Five corrections and one policy conflict follow.

### Confirmed, with the exact evidence

| Claim | Verified at | Evidence |
|---|---|---|
| Signup picker never selects the orderable restaurant design | `web/src/lib/site-admin/server/signup-design-pick.ts:36` | `{ words: ["restaurant","cafe",...], designId: "restaurant" }`. `restaurant-orderable` and `store-orderable` are registered in `PAGE_DESIGNS` and are unreachable from `pickSignupDesign`. |
| A salon or barber gets the fine-art print storefront | same file, `AUDIENCE_DEFAULT.business` | No salon/barber/clinic/spa keyword row exists, so `business` falls through to `designId: "store"`. |
| `/reserve` is not a route | `page-designs/restaurant.ts` | Its only CTA is `href: "/reserve"`. Not in `AGENCY_STOREFRONT_PREFIXES`, so the proxy rewrites to `/p/reserve`, which 404s. |
| Navigation is never seeded | repo-wide grep for `cms_navigation_links` | Exactly one file touches the table, `site-shell-backfill-action.ts`, and it only **reads** (`readNavLinks`, `.select(...)`). There is no writer anywhere in `web/src`. |
| `/contact` is deliberately not seeded | `onboard-starter-content.ts:630` | "CONTACT is deliberately NOT seeded. Owner-ratified". See the conflict in §2. |
| Sitemap publishes three paths unconditionally | `web/src/app/sitemap.ts:285` | `const fixedStaticPaths = ["/contact", "/directory", "/models"]`, emitted for every agency host with no workspace-type test. |
| `/models` is a shipped stub | `web/src/app/(public)/models/page.tsx` | An `h1` and a paragraph from the i18n catalog. No data, no links. |
| Business tenants expose talent routes | `web/src/lib/saas/surface-allow-list.ts:270` | `AGENCY_STOREFRONT_PREFIXES` includes `/directory`, `/book`, `/t`, `/models` and is keyed on **host kind**, never on `workspace_type`. |
| The dead-CTA tripwire does not walk page-designs | `sections/no-dead-contact-cta.static.test.ts:30` | `const SECTIONS = resolve(process.cwd(), "src/lib/site-admin/sections")` is the only root it walks. |
| Header CTA is free text | `site-admin/server/identity.ts:63` and `components/public-header.tsx:287` | `primary_cta_label` / `primary_cta_href` are nullable strings written straight from the site-header form. Nothing validates that the href resolves. |
| Terminology never reaches a public button | `lib/scheduling/terminology.ts` consumers | Thirteen consumers: appointments settings, reservation propose, instant-book notify, reservation notification entries. Not one public page component, not the header, not the page designs. |

### Corrections to the brief

**C1. The roster seed is three profiles, not five, and the gate already exists.**
`onboard-starter-roster.ts:61` already runs `if (!rosterEnabled(normalizeWorkspaceType(agency?.workspace_type))) return 0;`, and `resolveFreeStarterRosterSeedCount` returns `min(FREE_STARTER_SEED_TARGET=3, cap 5 - headroom 2) = 3`.

This does not make the problem go away, it relocates it, and the relocation matters:
`workspace-signup.server.ts:608` writes `workspace_type: lead.audience === "business" ? "business" : "talent"`. A **solo operator** — the barber, the coach, the photographer — answers `operator`, is written as `talent`, and `rosterEnabled("talent")` is `true`. So the operator still receives three fabricated profiles (Luna Alvarez, Mateo Rossi, Sofia Bennett) and, once the roster is active, a directory page for them.

The fix is therefore **not** "add a gate". The gate is there and is correct for the question it asks. The fix is that `workspace_type` is a two-value flag being asked a sixteen-value question. That is exactly the argument for F2's industry preset, and it means **F2 should land before or with the roster change**, not after. I have re-ordered the plan accordingly.

**C2. The tripwire's prescribed remedy is itself a dead link on business tenants.**
`no-dead-contact-cta.static.test.ts` fails a build for shipping `/contact` and instructs the author to "use `/directory`". But `app/(public)/directory/page.tsx:99` calls `assertRosterWorkspace(tenantId)`, which 404s for `workspace_type = "business"`. So the guard actively steers seeded CTAs onto a route that 404s for the exact tenants it was protecting. `impronta.ts` carries **fourteen** `/directory` hrefs.

The replacement tripwire must know about workspace type, or it will keep enforcing the wrong answer.

**C3. Sixteen dead routes, not one.**
The brief says "every dead href"; here is the full inventory across the thirteen registered designs, so the F1a diff can be reviewed against a list rather than a claim.

| Design | Dead hrefs |
|---|---|
| `agency` | `/index` |
| `coach` | `/book` ×2 (live only when appointments are on) |
| `conference` | `/tickets`, `/program` |
| `editorial` | `/series` |
| `festival` | `/lineup`, `/schedule`, `/passes` ×2, `/venue` |
| `impronta` | `/directory` ×14 (dead on business), `/contact` |
| `noir` | `/start`, `/contact` |
| `restaurant` | `/reserve` |
| `saas` | `/signup` ×2, `/demo` |
| `store` | `/shop`, `/collections`, `/studio`, `/cart`, `/cart/add` ×2 |
| `store-orderable` | `/about`, `/contact` |
| `studio` | `/start`, `/contact` |
| `restaurant-orderable` | `#menu` only — **the one clean design**, and the one the picker never chooses |

**C4. The words table needs no migration.**
Terminology is already persisted in JSONB at `agencies.settings.appointments.terminology` (`appointments-settings-types.ts`), not in a column. Words and the preset id follow the same precedent at `agencies.settings.words` and `agencies.settings.industry_preset`. F2 therefore ships with **zero migrations and zero timestamp coordination** with the other managers. The proposal's phrase "one words table" is satisfied as one table *in the admin UI*; the storage is a per-tenant override map of a few dozen keys, which is JSONB-shaped, not row-shaped. Flagged to the Director as a deliberate divergence from the proposal's wording.

**C5. Terminology is consumed, never replaced.**
The contracts registry lists the terminology read path as owned by Appointments and "agreed (exists)". The words layer therefore **defaults its Reservations rows from `resolveTerminology()`** and lets a words override win on top. Nothing in `lib/scheduling/` changes, and the Appointments Manager needs no coordination for F2.

---

## 2. The one policy conflict, for the Director

**F1 instructs me to seed `/contact` per workspace type. That reverses an owner-ratified decision.**

`onboard-starter-content.ts:630` records it plainly: a published placeholder contact page from minute one is a worse first impression than no contact page, so #1395 removed the seed and repointed every seeded link at `/directory`. `onboard-starter-content.test.ts:416` pins the decision with an assertion.

I am not going to quietly reverse an owner call. My proposal, which I believe satisfies both positions:

> Seed a contact page **only when it can be populated from real data** — `agency_business_identity` already holds public name, email, phone, address and socials, all collected at signup. A contact page rendered from the operator's own details is not a placeholder. When those fields are empty, seed nothing and point the header verb at `Ask` (the chat), which always works and needs no page.

This gives every workspace type a live "get in touch" path on day one without publishing lorem ipsum, and it removes the reason `/directory` was ever used as the fallback. **I need the Director to carry this to the owner before I write F1d.** F1a, F1b, F1c and F1e do not depend on it and start now.

---

## 3. PR sequence

Gates on every PR: `cd web && npx tsc --noEmit && npm run lint` with real exit codes, plus every curated lane in `web/package.json` that lists a test I touched, plus `test:size-ratchet`. New test files are added to a lane in the same PR.

### Wave A — has its go, no dependencies

| PR | Delivers | Exit proof | Migration |
|---|---|---|---|
| **F1a** | Every dead href in the thirteen page designs repointed. The tripwire is rewritten: it walks `sections/` **and** `page-designs/`, checks the full dead-route inventory from C3, and knows that `/directory` is dead on business workspaces (C2). | The new lane fails on `origin/main` for the sixteen routes in C3 and passes on the branch. Screenshot of a seeded restaurant homepage with a live primary button. | none |
| **F1b** | Picker selects `restaurant-orderable` for restaurant keywords; salon, barber, spa, clinic keyword rows added; `business` audience default stops being `store`; a static test asserts no emitted design contains a dead href (composes with F1a's inventory). | `pickSignupDesign` unit table for all sixteen preset archetypes; every emitted id passes the F1a tripwire. | none |
| **F2a** | The words engine. `lib/words/` — row registry (7 features, the ~24 rows 05f names), the sixteen presets, `resolveWords(settings, locale)`, defaults projected from `resolveTerminology()` per C5. Pure, no I/O, no UI. en and es for every row. | Unit tests: every preset resolves every row in both locales; a terminology change moves the Reservations rows; an override beats both. | none |
| **F2b** | The read path reaches the public surface. Header verb, the `/book` page, chat greeting and chips, and the receipt copy read `resolveWords`. Persisted at `agencies.settings.words` and `.industry_preset`. | Clicked, not asserted: a workspace set to `agenda` shows "Agendar" on its own public header on localhost. Screenshot in the PR. | none |
| **F2c** | Settings › Industry and words. The preset picker and the words table, both per the `SettingsPresets` / `SettingsWords` artboards. Auto-translate blanks and translator export. | Clicked path: pick "Sports venue", see a table become a court on the public page. Screenshot. | none |
| **F1c** | Sitemap emits per workspace type; `/models` stub deleted; `AGENCY_STOREFRONT_PREFIXES` becomes workspace-type aware so business tenants stop exposing `/t`, `/directory`, `/models`. | `sitemap.ts` unit test per type; a business host returns 404 on `/t/<slug>`, verified on localhost. | none |
| **F1d** | Nav seeded per preset (the first writer `cms_navigation_links` has ever had) and the contact page per §2. | **Blocked on the Director's answer to §2.** | none |
| **F1e** | Header CTA becomes a verb choice (Reserve, Order, Tickets, Book, Ask, custom link) rendered through the words layer. Depends on F2b. | The site-header form can no longer save an href that does not resolve for this workspace type. | none |

`surface-allow-list.ts` (F1c) is a shared file. I will message the Director before touching it.

### Wave B and later — waiting on the engines

| PR | Waits on |
|---|---|
| F3 the Sheet and the server cart | Orders 0.5, 0.6 |
| F4 guest pay and `/r/<code>` | Orders 0.5, 0.8 |
| F5 `/me` | Orders 0.4 |
| F6 one chat launcher | Orders 0.7, F3 |
| F7 whitelabel edges | F4 |
| F8 `/book` for businesses | Capacity 0.2, 0.3 |
| F9 venue, sessions, services designs | Phases 1 to 3 |

Mockups for F3, F4 and F5 across the restaurant and agency archetypes go to the Director for review before any of that code is written.

---

## 3b. The Orders contract, settled 2026-09-02

Agreed directly with the Orders & Checkout Manager and written into their §3 as a numbered pipeline step, so it does not live in two heads.

**The Sheet submits identity and intent. It never submits policy.** `PurchaseSubmit` carries `clientOrderKey`, `lines` (offering, variant, add-ons, units, optional slot), `contact`, `paymentChoice` and an optional note. Nothing else. The pipeline derives `reserve_mode`, `deposit_pct`, `allow_pay_in_person`, `require_account_to_book` and `cancellation_hours` server-side and refuses when the intent is not permitted. Prices come from the offering, variant and add-on rows, never from the payload, which is also what stops an offering edit mid-checkout from repricing a cart the client already agreed to.

`paymentChoice` (`"full" | "deposit" | "in_person"`) is the one field where the Sheet has an opinion, and only because a policy can permit more than one option. It is a choice among options the pipeline derives independently, never an assertion about what the options are. It is always sent, even when the Sheet offered only one option.

Two things that are mine to get right in F3:

- **`clientOrderKey` is per cart, not per click.** Minted when the draft order is created and stable across re-renders, retries and a back-navigation into the same cart. A fresh key per Pay click turns a double-tap into two orders, because it is the pipeline's idempotency anchor. A genuinely new cart gets a new key.
- **`contact` must carry at least one of email or phone.** `customers` has a CHECK requiring it. An email-only buyer is the entire point of that table; a buyer with neither is not representable and the pipeline refuses rather than inventing a placeholder.

Consequence for sequencing, confirmed both ways: **F3 needs nothing from Orders beyond the draft order itself.** No policy contract, no mode enum, no shared resolver. Draft order in, receipt out.

**D4 resolved between us:** the offer card becoming the order card is an internal rename. The coordinator reads "order"; the client keeps reading "quote" while it is awaiting approval. Different strings in different surfaces over one record, which is the whole "one object, three lenses" claim. The Orders Manager will not ship a customer-facing string change as a side effect of an internal rename.

### A correction to my own identity ladder, from Orders

**Guests already have `auth.users` rows today.** `ensureGuestClientByEmail` has nine call sites, and production has 8 "clients" of which 6 are `menu-qa-<timestamp>@example.com`: permanent auth identities minted by menu-order QA runs.

This contradicts what my mockups and §05d's trust ladder assume. "Guest (signed cookie) can browse, chat, reserve and buy with an email" describes the intended mechanism, not the current one. It changes nothing about what F4 and F5 should look like, but it does mean:

- `/me`'s email-code sign-in cannot assume the address has no account. It must tolerate an existing auth row that the person never knowingly created, and must not present that as "you already have an account, sign in".
- The Receipt at `/r/<code>` must stay reachable without a session even for an email that happens to have an auth row.

De-provisioning is Orders 0.4b, deliberately sequenced **after** 0.6, when the order pipeline is the last guest producer and the guest token exists. `client_user_id` is read by about a dozen workspace modules, so it is not a 0.4-sized change. I am not blocked on it; I need to build F5 so that it is correct both before and after.

## 4. Contracts I own, and who reads them

| Object | Consumers | Status |
|---|---|---|
| `lib/words/` registry, presets, `resolveWords` | every feature manager declares their rows; the Dashboards Director reads it for rail labels | proposed, F2a |
| `agencies.settings.words`, `agencies.settings.industry_preset` | Front Door writes, everyone reads | proposed, F2a |
| the Sheet component contract, draft order per guest session | every feature | proposed, F3 |
| `/r/<code>`, `/me` | every feature | proposed, F4, F5 |

Things I consume and will not change: the terminology read path (Appointments), `menu-board-island.tsx` (Menu Workspace), the guest trust ladder, the abuse guards and the captcha.

## 5. Log

- 2026-09-02 — verification pass against `2e2868ef3`; plan written; §2 conflict raised with the Director.
- 2026-09-02 — **C6**: no in-page anchor resolves in any page design (a node id is emitted as `data-builder-node-id`, never a DOM `id`; nothing handles a hash href). So `restaurant-orderable`'s primary button is inert and it was not the clean design C3 reported. F1b re-sequenced behind F1a. The Director routed the `anchorId` prop to the Page Builder Director; I do not touch `builder-node/`.
- 2026-09-02 — **F1a written** on `fix/front-door-dead-ctas`. The Director's split applied: Class A (real destinations) all point at `?inquiry=open`, the documented cross-surface chat cue; Class B (the two in-page anchors) deliberately left inert pending a real anchor.
  - 26 hrefs repointed across 11 designs. Untouched and correct: 14 `/directory` in `impronta.ts` (agency archetype), 2 `/book` (allow-listed for every workspace type), 2 `#menu` (Class B).
  - **The cue reader was mounted in the wrong place.** `DirectoryInquiryUrlSync` turns `?inquiry=open` into an open panel and was mounted only on `/directory`, while the launcher is on the home storefront and every CMS page. So the "cross-surface fallback every repointed entry routes through" did nothing on the two surfaces a seeded design renders on. It now mounts inside `AgencyChatLauncherMount`, so the reader cannot drift from the launcher again.
  - Guard replaced: `no-dead-contact-cta.static.test.ts` becomes `no-dead-default-cta.static.test.ts`. It walks `sections/` **and** `page-designs/`, classifies the resolved destination per workspace shape instead of pinning a string, and self-tests that it still rejects the exact hrefs that shipped on `2e2868ef3`.
  - **New finding, outside F1a's scope:** the guard exposed **37 dead defaults in the seeded section library**, 21 of them `/directory`. They are the direct product of the old guard, which failed builds for `/contact` and told authors to use `/directory`. Frozen behind a per-file ratchet that can only go down. This is F1a-2 and needs the Director's sequencing, since it changes every seeded section's call to action.
  - Gates: guard lane exit 0 (4 tests), `page-designs` lane exit 0, `onboard-starter-content` exit 0 (29 tests, run through its lane wrapper), `npm run lint` exit 0. Full `tsc` pending behind machine contention.
- 2026-09-02 — **Open label question.** F1a fixed destinations, not labels. A nav item reading "Schedule", or a button reading "Add to cart", that opens a chat is honest about where it goes and dishonest about what it is. I did not unilaterally redesign five designs' navigation. Proposal: labels belong to F1e, where the header CTA becomes a verb resolved through the words layer, and the same mechanism should reach seeded nav labels.
