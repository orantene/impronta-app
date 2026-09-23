# Jor Beauty — flagship service-professional profile (2026-09-22)

A complete, high-fidelity public profile for **Jor Beauty** (Jorgelina, independent beauty
professional, Playa del Carmen Centro), built as a **reusable Tulala profile template** rather
than a one-off page.

## How to see it

```bash
cd web && TULALA_ALLOW_DEV_SURFACES=1 npm run dev -- --port 3200
```

| URL | What it shows |
|---|---|
| `http://localhost:3200/dev/jor-beauty` | The full profile, Spanish |
| `…?lang=en` | The template's English chrome (talent-authored copy stays as written) |
| `…?state=empty` | The same template on a profile that has filled in **nothing** optional |
| `…?state=edge` | One service switched to "on request", one unpublished |

The `/dev/*` route is production-gated (404 in production) and lives outside the `(public)`
group, so it needs no tenant host or Supabase round trip. `TULALA_ALLOW_DEV_SURFACES=1` is
required because `proxy.ts` gates `/dev/` on that flag and Next inlines `NODE_ENV=production`
into the proxy bundle even under `next dev`.

## What was built

| File | Role |
|---|---|
| `web/src/app/t/[profileCode]/_maison/MaisonProfileLayout.tsx` | The template. Fifth sibling of Light / Noir / Lumen / Atelier, same props. |
| `…/_maison/MaisonMenu.tsx` | Client island: category tabs, option ladders, add-ons, CTA per row. |
| `…/_maison/MaisonPortfolio.tsx` | Client island: tag filter around the production `PortfolioGalleryLightbox`. |
| `…/_maison/MaisonChrome.tsx` | Sticky nav + mobile booking bar. |
| `…/_maison/maison-styles.tsx` | One `.mn-`-namespaced stylesheet, mobile-first. |
| `…/_maison/maison-content.ts` | `MaisonContent` — the optional editorial block, every field with a fallback. |
| `web/src/lib/talent/offerings-money.ts` | Region-aware money formatting (see "Improvements" below). |
| `web/src/app/dev/jor-beauty/*` | The harness: seed data, the demo booking sheet, its styles. |
| `web/public/mockups/jor-beauty/*` | The image set (11 AI-generated + Jorgelina's own photo). |

Registered as a first-class, tenant-selectable template:

- `profile-view.tsx` dispatch (`?template=maison` and the `template.profile-layout-family` token)
- `lib/talent-profile/profile-page-templates.ts` (the agency chooser catalog)
- `lib/site-admin/tokens/registry.ts` (the token validator the save action checks)
- `messages/{en,es}.json` + `ProfilePagesStudio.tsx` (picker copy)

`profile-page-templates.parity.test.ts` passes — the three declaration sites stay in sync.

## How the workspace powers the public page

```
Workspace catalogue (talent_offerings)
  ├─ category                → the menu tabs
  ├─ title / description     → the service row
  ├─ amount_cents + currency → the price (MXN, formatted $300 not "300 MXN")
  ├─ price_display           → "Desde $500" when a service has an option ladder
  ├─ is_featured             → the Featured Services cards
  ├─ duration_minutes        → the duration chip AND the slot length
  ├─ booking_mode            → instant ⇒ "Reservar ya"; request ⇒ "Reservar"/"Solicitar"
  ├─ reserve_mode/deposit    → what the booking sheet collects (here: free reserve, pay in studio)
  ├─ visibility              → public / on-request ("Bajo consulta") / agency-only (hidden)
  ├─ status                  → draft and archived rows never render
  ├─ talent_offering_variants → "Elige una opción" (Largo #2 / #3 / #4-5)
  └─ talent_offering_addons   → "Diseños y extras" (Ojo de gato, French, otros efectos)
          │
          ▼
  public storefront loader (loadPublicOfferingsForProfile)
          │
          ▼
  MaisonMenu row → shared OfferingCta → window event
          │            (tulala:offering-instant | -slot | -request)
          ▼
  production mounts on /t/<code>: OfferingInstantMount → createInstantBookingAction
  dev harness on /dev/jor-beauty: DemoBookingSheet (same event contract, no writes)
          │
          ▼
  appointment in the workspace calendar · confirmation in the Tulala inbox ·
  studio address released on confirmation
```

Nothing on the page keeps its own copy of the menu. Change a price in the workspace and the
hero "Desde", the featured cards, the menu row, the signature ladder, the mobile bar and the
booking sheet all move together.

## Profile-field / widget mapping

| Public section | Widget / component | Source field or model | Missing support | Recommended action |
|---|---|---|---|---|
| Display name | `MaisonNav`, hero `<h1>`, footer | `talent_profiles.display_name` | — | — |
| Professional title | nav kicker, hero eyebrow, trust strip | `primaryType` (taxonomy `talent_type`) | — | — |
| Biography | About band | `talent_profiles.short_bio` / `bio_i18n` (via `publicBioForLocale`) | — | — |
| Experience ("7 años") | trust strip | `talent_profile_taxonomy.years_experience` → `resolvedSkills` | — (**my first pass wrongly called this missing**) | Done: the strip now takes the largest `years_experience` |
| Specialty ("Pestañas") | trust strip, signature band | `resolvedSkills` `relationship_type = primary_role` (terms "Lash Artist"/"Lashista" already exist in the taxonomy) | Signature band still needs to know which CATEGORY is the specialty | Strip is derived; map the primary skill to an offering category, or flag the category |
| Languages | footer, trust strip | `talent_languages` + `fieldVisibility.showLanguages` | — | — |
| Service area | Hours & location | `talent_service_areas` → `locations` | Mockup passes the label directly | Wire `serviceAreas[0]` into `MaisonContent.visiting.areaLabel` |
| Private-location behaviour | Hours & location + FAQ | — | **No "address released on confirmation" model** | Add `talent_profiles.location_privacy = area_only \| exact` + release the exact address on booking confirmation |
| Availability (days / notice) | Hours & location, booking sheet, trust strip | `talent_booking_hours` — timezone, weekly windows, dated exceptions, slot length, before/after buffers, min notice, horizon | — (richer than this mockup needs) | Fill her real hours; the template + slot picker read them |
| Catalogue categories | menu tabs | `talent_offerings.category` | Free-text, no order, no per-category note | Promote to an ordered category record with a label + note |
| Services | menu rows, featured cards | `talent_offerings` | — | — |
| Variants | "Elige una opción" | `talent_offering_variants` | — | — |
| Add-ons | "Diseños y extras" | `talent_offering_addons` | Add-ons are per-service; hers repeat on 4 nail services | Allow an add-on GROUP reusable across services |
| Prices / currency | everywhere | `amount_cents` + `currency` | `formatOfferingPrice` dropped the region → "300 MXN" | **Done**: `lib/talent/offerings-money.ts` resolves the currency's home locale → "$300" |
| Portfolio | portfolio band | `media_assets` (+ `PortfolioGalleryLightbox`) | **No tags on media** | Add `media_assets.tags text[]` (or a join to taxonomy) and filter from it |
| Featured services | featured cards | `talent_offerings.is_featured` | Order is not editable | Add `featured_position` (mirrors the talent `featured_position` pattern) |
| Appointment CTA | every row + nav + hero + sticky bar | `OfferingCta` → instant-book / inquiry rail | — | — |
| Social links | footer | `talent_integrations` | Not supplied by Jorgelina → section hidden | Nothing to do; it appears when she connects one |
| Contact methods | booking sheet | inquiry rail (Tulala inbox) | No phone/WhatsApp confirmed | Nothing to do; never invent one |
| Reviews | reviews band | `loadTalentReviews` + credibility floor | None yet → band hidden | Invite reviews after her first bookings |
| FAQ | FAQ accordion | **none** | **No per-profile FAQ model** | Add `talent_profiles.public_faq jsonb` (`[{q,a}]`) + an editor row; `faq_accordion` already exists for sites, reuse its editor shape |
| Booking steps | "Cómo reservar" | **none** | Template-level copy | Keep as template copy (it describes the platform flow, not the talent) |
| Image roles | hero / cards / portfolio | `media_assets` + `talent_offering_media` | No "hero/banner" role on the profile beyond `bannerUrl` | Reuse `bannerUrl` for the hero; the template already falls back banner → first gallery item |

## Missing reusable capabilities found

1. **Per-profile FAQ** — nothing stores a talent's Q&A. Smallest fix: `talent_profiles.public_faq jsonb`.
2. **Media tags** — the portfolio filter has no data model behind it. Smallest fix: `media_assets.tags text[]`.
3. **Location privacy** — "area public, address on confirmation" is a real pattern for home studios and is not modelled anywhere. Smallest fix: a `location_privacy` enum + address release on confirmation.
4. **Offering categories as records** — free-text `category` cannot carry order, a note ("manicura rusa incluida"), or a specialty flag.
5. **Reusable add-on groups** — her three nail designs are duplicated across four services.
6. **Regional money formatting** — fixed here in `lib/talent/offerings-money.ts`; folding it into `formatOfferingPrice` would fix every other surface too (directory cards, offers, checkout).
7. **`service-professional` layout family** — the token registry already accepts that value but it falls back to `classic`. Mapping it to `maison` is a one-line change and an owner decision, because it would re-skin any tenant already on that value. **Not done** — needs a ruling.

## Second pass — gaps found by tracing the booking + template code

8. **The profile template is chosen per TENANT, not per talent.** `template.profile-layout-family`
   lives in `agency_branding.theme_json` and is written by an agency admin
   (`lib/server-actions/admin-profile-template.ts`). An independent professional listed on the
   Tulala hub inherits the HUB's template — she cannot pick Maison for her own profile unless she
   owns a workspace. Fix: allow a per-talent override (`talent_profiles.profile_template`) that
   falls back to the tenant token.
9. **Direct booking is plan-gated, and the free tier cannot do it.**
   `appointments-plan-policy.ts`: `free → maxMode: "request"`, `website → instant`. Her page shows
   "Reservar ya" only on a paid tier; on free every CTA degrades to an inquiry. Not a bug — but it
   is a commercial prerequisite nobody had written down for her.
10. **`loadInstantBookEligibility` is agency-surface only** (`hostCtx.kind === "agency"`), so the
    legacy fixed-rate "book now" never arms on the hub. The offering-level instant path does work
    on the hub (it rides `slotTenantId`), which means two booking entry points follow different
    surface rules. Worth one ruling.
11. **JSON-LD describes a Person, not a local business.** `lib/seo/talent-json-ld.ts` emits
    `Person` + `ProfilePage` + an offer `ItemList`. A studio with an area, opening hours and a
    price list should also emit `LocalBusiness`/`BeautySalon` with `areaServed`,
    `openingHoursSpecification` and `priceRange` — that is what earns the local/service rich
    results she would actually be found through.
12. **The legacy services-menu fallback defaults to USD.** `normalizeServicesMenu(…, instantBook.currencyCode || "USD")`
    — on any surface where instant-book eligibility does not resolve, a MXN menu is labelled in
    USD. Her page uses `talent_offerings` so it is not affected, but any talent still on the
    legacy menu is.
13. **Featured order is not separately editable.** `talent_offerings.is_featured` exists,
    `featured_position` does not, so the featured row inherits catalogue `sort_order`.

### Checked and found NOT to be gaps

- Booking hours for a solo practitioner — `talent_booking_hours` already carries timezone, weekly
  windows, dated exceptions, slot length, before/after buffers, min notice and horizon.
- Talent self-service catalogue — `TalentOfferingsManager` + `OfferingOptionsEditor` already let a
  talent create services, variants and add-ons herself.
- Beauty taxonomy — "Lash Artist", "Lashista", "Nail Artist", "Beauty Services" already exist as
  terms; the mockup should use them rather than a free-text professional title.
- Language proficiency levels — `localizeSpeakingLevel` exists, so "Inglés básico" is structured.

## Still required from Jorgelina before this can be published

Nothing below is invented anywhere in the page; each one is either hidden or marked.

| Item | Status on the page |
|---|---|
| Appointment durations | **Seeded estimates**, marked with `*` and "Duración estimada. Se confirma al agendar." |
| Phone / WhatsApp | Not shown anywhere |
| Instagram / TikTok | Footer social row hidden |
| Profile photograph | Her own photo is used in the About band (supplied 2026-09-22) |
| Exact studio address | Never rendered; the page says it is shared on confirmation |
| Payment methods | Sheet says only "No se cobra nada ahora. El pago se realiza en el estudio." — confirm |
| Deposit requirement | None configured (`reserve_mode: free`) |
| Cancellation / late policy | Absent — no FAQ answer invented |
| Certifications | Never claimed |
| Reviews / testimonials | None seeded; the band is hidden |
| Product brands | Never named |
| Hygiene claims | Never made |

## Imagery

11 images generated with OpenAI `gpt-image-1` from one coordinated art direction (warm natural
light, porcelain/blush/neutral palette, realistic Latina clients, natural skin texture, no text,
no watermarks), then compressed to JPEG. Aspect ratios match the template's slots: 3:2 hero,
1:1 service cards, 2:3 portrait portfolio. The only real photograph is Jorgelina's own, used as
the About portrait — **no AI portrait is presented as her**.

Replacing them from the workspace changes nothing in the design: the hero reads `bannerUrl →
first gallery item`, the cards read `talent_offering_media`, the portfolio reads `media_assets`.

## QA performed (local, 2026-09-22)

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `profile-page-templates.parity.test.ts` — 4/4 pass
- Mobile (375×812): whole page walked top to bottom, no horizontal overflow, sticky book bar
  reveals after the hero, 44px+ targets throughout
- Desktop (1440×900): whole page walked top to bottom
- Booking flow clicked end to end: Soft Gel → option Largo #2 → add-on Ojo de gato → live total
  → date grid (Sunday disabled) → time → empty-name/contact validation refuses → confirmation
- `?state=empty`: hero, trust strip, menu and portfolio all degrade to honest empty states
- `?state=edge`: the draft service disappears; the on-request service shows "Bajo consulta" + "Solicitar"

### Not yet done

- No automated accessibility audit (axe) was run; contrast, semantic headings, keyboard order,
  `prefers-reduced-motion` and focus rings were built in and eyeballed, not measured.
- The template has not been rendered against REAL Supabase rows — there is no seeded Jor Beauty
  tenant. Seeding one (or flipping a test tenant's `template.profile-layout-family` to `maison`)
  is the next step before showing it to her.
