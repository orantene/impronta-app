# Impronta · marketing pages & products — handover (2026-09-17)

**For:** Alejandra's team (the person who will maintain the site)
**Site:** https://improntamodels.com (English) · https://improntamodels.com/es (Spanish)
**Admin:** https://app.tulala.digital/impronta/admin (sign in with the agency account) — Menu: `/impronta/admin/menu` · Website pages: `/impronta/admin/website` · Messages: `/impronta/admin/messages`

Everything below is live now. Nothing needs a developer to change a price, a date, a sentence or a photo.

---

## 1. What is live

| Page | URL | What it sells |
|---|---|---|
| Home | `/` | New **"What we do"** strip (9 client segments) · **Show** band now says "Now booking" · new **Experiences** band (Model for a Day, Posing Course, photo sessions) · the old "Studio & workshops" order form (USD prices) is gone |
| Experiences & photo sessions | `/experiences` | **NEW.** Model for a Day (27 Sep, $2,500 MXN pp), Posing Course (October, $7,000 MXN pp), Self-makeup workshop (coming soon), 4 photo packages ($1,500 / $2,500 / from $3,000 / $3,000 MXN), FAQ, booking form |
| The Show | `/show` | Rewritten for **hotels, resorts, beach clubs, casinos, restaurants**: what is included, formats, how a venue books it, venue inquiry form, casting form kept |
| For clients | `/for-clients` | New **"Who we work with"**: 9 cards covering all 14 target areas from Alejandra's list, each with a "start an inquiry" link |
| The Studio | `/studio` | New **"Packages & prices"** list linking to the experiences page |
| Header menu | all pages | Our Talents · **Services** (menu with the 6 briefs + the Show featured) · **Experiences** · **The Show** · About · Contact. The top bar links to the LUMINA launch party (21 November) |

Both languages are complete on every page above.

## 2. How an inquiry arrives

Every button on these pages ends on a **form**. When a visitor sends it, it becomes an **inquiry in the Inbox** (Admin → Messages), with the product named in the first line, for example:

> `What would you like to book?: Curso de Posing · octubre`

Reply there. Seats, exact time, payment link and address are all confirmed **in that conversation** — that is on purpose: no live seat counter until a date has a confirmed time and capacity (see §6).

Forms on the site: `/contact` (general brief), `/experiences#rb-exp-book` (experiences and sessions), `/show#rb-show-venue` (venues), `/show#rb-show-casting` (performers), `/studio#rb-studio-booking` (studio).

## 3. Where to change things

### Prices, dates, product names (two places, keep them in sync)
1. **Admin → Menu** — the product list (the "catalog"). This is what the inbox, quotes and the counter use. Edit the price here first.
2. **The page card** — Admin → Website → open the page → click the card → edit the price text. The card is plain text so it reads exactly as you type it (e.g. `$2,500 MXN`).

Products in the Menu (all in MXN, all "request" booking):
`Model for a Day · 27 Sep 2026` · `Posing Course · October 2026` · `Self-Makeup Workshop (coming soon)` · `Photo session · studio + photographer` · `Photo session + makeup artist` · `Complete session · makeup + hair + styling` · `Vintage-era photos` · `Show Impronta · hotels, resorts & venues`.
The old `Posing course — September (12 spots)` (USD) and `test` were archived.

### Text (English and Spanish)
Admin → Website → open the page → click any text. The inspector shows an **EN / ES** tab for every sentence; Spanish is a translation layer on the same design, so you never edit two pages. If a Spanish tab is empty the English shows in its place.

### Photos
The new photos for the experiences and show pages are **AI-generated stand-ins** (Media library → folder **Lifestyle**). Replace them with real frames the moment you have them:
- Media library → upload the real photo.
- Open the page → click the image → "Replace" → pick it.
Priority swaps once the show is recorded on Sunday: the show hero (stage), the three "what is included" cards, and the home "Now booking" band image.

**Show video:** the show hero accepts a YouTube link (open the page → click the hero → "Background video"). The still stays as the poster.

### Header menu
Admin → Website → **Site shell** → click the menu → edit links and the Services submenu (labels ≤ 26 characters so they fit the phone drawer). Publish the shell after editing.

## 4. Things assumed — please confirm

| Item | What is on the site | Confirm |
|---|---|---|
| Model for a Day | 27 September 2026, $2,500 MXN per person, "limited seats" | start time, number of seats |
| Posing Course | October 2026, $7,000 MXN per person, "dates confirmed on sign-up" | exact dates |
| Complete session | "From $3,000 MXN" | $3,000 or $3,500 (the page says exact price confirmed with the brief) |
| Self-makeup workshop | "Coming soon · date and price to be announced" | date, price |
| Show formats | resident show, special nights, clubs/casinos/restaurants, guest activations | wording, and the price bands you want to quote |
| Studio address | "comes with your confirmation message" | whether to publish it |

## 5. Not done on purpose (and how to do it later)

- **Live seat booking** (pay online, seats count down): the platform has it (Admin → Sessions → create the class date with capacity, then add a "Book a session" block to the experiences page). Turn it on for Model for a Day once the time and seat count are fixed. Until then the form + inbox flow sells it.
- **Ticket sales for the show / events:** same engine as LUMINA (Admin → Events). Not needed for a hotel sale, which is a quote.
- **The old Spanish page rows** for show and for-clients still exist in the admin list. They are harmless (the Spanish site renders from the English page's translation layer), and their SEO titles are used for `/es/...`. Edit Spanish text through the EN/ES tabs, not on those rows.

## 6. Bug fixed along the way
In-page buttons such as "Register your interest" (show hero) and "Book a session" (studio hero) were dead clicks on the live site: the sections had no HTML anchor. Every section seeded from code now carries one, so `#…` links land.

## 7. For developers
Everything is reproducible from the repo (`web/scripts/impronta-rebuild/`):

```bash
cd web
npx tsx scripts/impronta-rebuild/seed-marketing-2026-09.ts            # dry run (pages, home/studio patches, header nav)
npx tsx scripts/impronta-rebuild/seed-marketing-2026-09.ts --apply    # write (needs NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs')
npx tsx scripts/impronta-rebuild/seed-catalog-2026-09.ts --apply      # Menu products
npx tsx scripts/impronta-rebuild/generate-offer-imagery.ts            # AI stand-in imagery (pins in image-slots.json)
npm run test:impronta-pages                                           # EN/ES parity + structure + link guards
```
Page modules: `pages/experiences.ts` (+ `-es-copy`, `-es`, test), `pages/show.ts`, `pages/for-clients.ts`, live patches `pages/home-marketing-patch.ts`, `pages/studio-marketing-patch.ts`, `shell/nav-marketing-patch.ts`. Card helpers: `shared-offers.ts`.
Form prefill (`?f_<field>=`): `src/lib/site-admin/builder-node/form-prefill.ts` — ships with the PR; until it is deployed the links still land on the form, just without the product preselected.
