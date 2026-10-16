# Promos & Discounts Engine: Talent Dashboard (design, v1.1)

2026-10-14 · Brainstorm agent → PM · Design only, no code. v1.1 = Oran decisions locked (section 0.5) + PM challenges answered (section L) + PR plan (section M). Where L contradicts earlier sections, L wins.

**One-line pitch:** a promo is *a rule + a reason + a link*. The talent/profesional picks the reason ("empty Tuesday", "launch", "come back"), and the engine fills in the rule and produces the link, the visual and the results.

---

## 0. Grounding: what already exists (don't build a third store)

| Thing on `main` | What it is | Relation to this design |
|---|---|---|
| `product_discounts` + `discount_redemptions` | Tulala's own SaaS plan coupons (platform admin) | **Not ours.** Never reuse it for talent promos. |
| `tenant_promo_codes` + `tenant_promo_redemptions` (`20261229000367`) | Workspace-owned codes: percent/fixed, event/variant scope, max + per-customer caps, window. Redemptions are rows, and there is one code per order | **This is the seed of the engine.** Its migration header says the repo already "killed two rival discount stores". We **extend this table**, not a new one. |
| `admin/discounts` page + POS `DiscountSheet` | The business admin UI over the above | Align later (story 14). The talent UI becomes a second face on the same engine. |

**Recommendation:** the talent engine = `tenant_promo_codes` grown into `promos` (rename later, or a view), keyed to the talent's workspace. A talent with their own site already *is* a tenant, so one engine serves both dashboards.

---

## 0.5 Locked decisions (Oran, 2026-10-14)

| # | Decision |
|---|---|
| Q1 | The 1.5% fee is on the **charged (discounted) price**. Receipts show three lines: list price, discount, platform fee. |
| Q2 | **Paid feature.** Free plan: open Promos, browse templates, build and preview, and the draft is kept. Going live needs an upgrade, except **one lifetime "first promo free" trial**: public + auto only, max 7 days, max 5 uses, so they see a real result card. Paid only: codes, personal offers, repeat/duplicate-to-run, QR/print, results history (the trial's own result card stays visible). Section G1 is superseded by this. |
| Q3 | Best deal wins, free extras stack. Locked for v1. |
| Q4 | Talent cancels → the client gets a 14-day personal re-issue. |
| Q5 | Scarcity shown only at ≤5 left, always the real number. |
| Q6 | Max 90%. 100% = a separate **"Free booking / Cortesía"** action: records the client, booking and reason (`influencer`, `gift`, `make_good`, `other`), no Stripe charge, no fee, and shows in results as **gifted value**. |
| Q7 | WhatsApp is the first share button on ES sites. |
| Q8 | Talent promos apply on the talent site + hub only in v1, never on agency bookings. |
| Q9 | Packages/credits come after Stripe MX payouts are stable, in their own design doc. |
| Q10 | One engine now (extend `tenant_promo_codes`). The admin UI aligns later. |

---

## A. The engine model

### A1. Mental model: five building blocks

```
PROMO = Offer  (what the client gets)
      + Target (what it applies to)
      + Who    (audience)
      + When   (time rules)
      + Limits (how many)
      + Unlock (how it's applied: auto / code / link / personal)
```

Every story is a combination of these blocks. Templates are pre-filled combinations.

### A2. Offer types (the "what")

| Type | Example | Math | v1? |
|---|---|---|---|
| `percent` | 20% off | price × (1 − p) | ✅ |
| `fixed` | $200 MXN off | price − amount, floor at 0 | ✅ |
| `fixed_price` | "Gel mani $350 this week" | set the price | ✅ (cheap, very common in salons) |
| `free_addon` | lashes free with full glam | auto-attaches the add-on at 0, the main price is unchanged | ✅ |
| `second_guest` | friend pays 50% | the % applies to guest #2's line only | v1.1 |
| `bundle_credits` | buy 10 pay 8 | sells a package, which becomes credits | v2 (needs a credits ledger) |
| `pay_in_full` | 10% off if paid upfront | conditional on payment mode | v1.1 |
| `loyalty_reward` | 6th visit gets a free add-on | a punch card that issues a personal reward | v2 |
| `free_gift` (products) | free mini on the first 3 orders | adds a 0-price product line | v1.1 |

> Design rule: **loyalty and packages are not "discounts".** They are *programs* that *issue* personal promos (loyalty) or *credits* (packages). Keep them as separate objects that reuse the same redemption plumbing. That stops the promo form from becoming a 40-field monster.

### A3. Target (scope)

- `all_services` · `services[]` (offering ids) · `variants[]` · `addons[]` · `products[]` · `all_products`
- Optional **minimum spend** (`min_subtotal`) and **minimum quantity** (bring-a-friend = qty ≥ 2)
- Excludes: gift cards and credit purchases are never discountable by percent promos (no discounting money with money)

### A4. Who (audience)

| Audience | How it's enforced | Story |
|---|---|---|
| `public` | Anyone. Auto-applied, shown as a badge | 1, 2, 3, 7, 10 |
| `code` | Must enter or hold the code. Prices look normal otherwise | 6 |
| `link` | A deep link carries a signed token. No typing needed, and it's hidden from the public site | 6 (better UX) |
| `new_clients` | No prior completed booking or order with this talent (matched on email + phone) | 7 |
| `returning_clients` | ≥1 prior completed booking | – |
| `lapsed_clients` | Last visit ≥ N days ago | 8 (bulk) |
| `one_client` | Bound to a `customer_id`. Unusable by anyone else even with the link | 8 |

The audience combines with the unlock: e.g. `new_clients` + `public` = "new clients see 30% off automatically".

### A5. When (time rules), all in the **talent's timezone**

- `starts_at` / `ends_at` (a window; auto on/off)
- `weekdays[]` (recurring: Tue only)
- `time_of_day` window (e.g. 10:00–14:00 "happy hour")
- `slot_id` (story 3: exactly one calendar slot)
- **Important split:** *booking date* vs *appointment date*.
  - "Every Tuesday 15% off" = the **appointment** is on a Tuesday (whenever it's booked).
  - "Mother's Day May 1–10" = **booked** in that window (appointment can be later).
  - Each promo stores `applies_on: 'appointment' | 'purchase'`, and the template picks a sensible default so the talent never sees this word. ✅ this is the #1 silent bug source in every booking-discount product.

### A6. Limits

- `max_uses` (first N, total) · `per_client_max` (default 1) · `budget_cap` (stop after $X given, v1.1)
- `max_uses` counts **confirmed redemptions + live holds** (see B2)

### A7. Stacking & conflict rules (simple, explainable)

Plain-language rule shown to the talent:
> **"Clients always get your best deal. Deals don't stack, except free extras and loyalty rewards."**

The engine:
1. Collect all eligible promos for the cart (auto ones + the held code/link/personal one).
2. Split them into **price promos** (percent / fixed / fixed_price / second_guest / pay_in_full) and **gift promos** (free_addon / free_gift / loyalty_reward).
3. Pick the **single best price promo** (the largest client saving; tie-break: personal > code > public, then whichever ends sooner).
4. **Add all gift promos** (they stack with one price promo, since they don't touch the main price).
5. Credits/packages pay the price *after* promos (credits are tender, not a discount).
6. Hard floor: the line price never goes below 0. The order total can't go below the platform minimum charge (Stripe min ≈ $10 MXN). If it would, it becomes a free booking with no Stripe charge.

v2 option per promo: `stackable: true` (an advanced toggle, hidden). Not in v1.

When a client's code loses to a better auto promo: show *"You're already getting a better deal (30% launch offer). Your code LUZ10 wasn't needed."* Don't consume the code redemption.

---

## B. Lifecycle

```
          ┌──────── schedule ────────┐
 DRAFT ──►│ SCHEDULED ──(start)──► LIVE ──(max uses)──► SOLD OUT
   ▲      └──────────────────────────┘   │  ▲                │ (seat released)
   │                                     ▼  │                ▼
 duplicate                             PAUSED              LIVE again
                                         │
               (ends_at) ────────────► EXPIRED ──(30d / manual)──► ARCHIVED
```

- **Status is computed**, not stored (except `draft`, `paused`, `archived` flags): live = active ∧ now in window ∧ uses_left > 0. This means no cron is needed for auto on/off, and it can't drift. A cron is used only for *notifications* ("your promo goes live in 1h", "sold out 🎉"), and the existing `discount-ending-warnings` cron is the pattern.
- **Sold out is reversible**: if a hold expires or a booking cancels within the window, the promo returns to Live and the badge flips back ("1 spot back!" is a nice moment, and optionally notifies the talent).

### B2. Holds for "first N"

- Selecting a slot with a promo creates a **hold** (`status=held`, `expires_at = now + 10 min`) at the **checkout** step, not on page view.
- The counter shows `max_uses − confirmed − active_holds`. The client sees "2 of 3 left", and holds count as taken.
- Hold → `confirmed` on payment success (or on request-accepted for no-payment bookings) · `released` on expiry or abandonment.
- **Request-to-book flows** (the talent must accept): hold for up to 24h or until the talent declines. Show the talent "This request uses 1 of your 3 promo spots".
- Race: the last spot is guaranteed by a row-count check inside the same transaction as the hold insert (same philosophy as the existing "redemptions are rows" header).

### B3. Cancellations, refunds, reschedules

| Event | Promo use returns? | Price |
|---|---|---|
| Client cancels inside the free-cancel window | ✅ seat returns (if the promo is still in its window) | refund what was paid (discounted) |
| Client cancels late / no-show (fee kept) | ❌ seat consumed | per policy |
| Talent cancels | ✅ seat returns **and** the client keeps the right to that promo for 14 days (a personal re-issue). Fairness, plus talents won't game it | full refund |
| Reschedule to a date **still eligible** | keeps the discount | unchanged |
| Reschedule to a date **not eligible** (e.g. Tue promo → Fri) | the client is warned *before* confirming: "Friday is regular price (+$90)". The talent can override "keep the discount" | difference charged or waived |
| Partial refund | use stays consumed | – |
| Package credits refunded | unused credits are refunded at the **paid per-credit price** (paid ÷ total credits), never at list price | – |

### B4. Edit a live promo safely

- **Always safe:** name, end date *later*, add uses, add services, the visual, the description.
- **Restricting changes** (lower %, earlier end, remove services, fewer uses than already used): allowed, but **existing bookings keep the terms they booked with** (redemption rows snapshot the amount). The talent sees: "3 people already booked at 20%. They keep it. New bookings get 15%."
- **Never editable after the first use:** offer type, code text, audience type. Instead → "Duplicate & end this one" (one tap).
- **Duplicate:** copies everything, status Draft, dates cleared, code gets suffix 2 → `LUZ10-2` (editable).
- **Repeat:** "Run again next month / next year" on expired promos (Mother's Day). It's just a duplicate with dates shifted +1y, plus a reminder notification 3 weeks before.

---

## C. Sharing kit

Every live or scheduled promo has a **Share sheet** (bottom sheet on mobile):

```
┌─────────────────────────────────┐
│  Share "Empty week 20%"         │
│  ┌──────────┐  ┌──────────┐     │
│  │ [story   │  │ [post    │     │   ← auto visuals, swipe for
│  │  9:16]   │  │  1:1]    │     │     3 styles (theme / bold / photo)
│  └──────────┘  └──────────┘     │
│  [Instagram] [TikTok] [WhatsApp]│
│  [Copy link] [Copy code] [QR]   │
│  Language: ES ▾  (site default) │
└─────────────────────────────────┘
```

- **Deep link:** `<site>/p/<slug>` (or `/t/<handle>/p/<slug>` on the hub). It lands on the right service with the promo **pre-applied** (stored in a cookie or session, survives navigation, 7 days). Personal promos use a signed token in the link. **No PII in the URL**, only an opaque token.
- **Visuals:** server-rendered images (OG-image style). The talent's theme fonts and colours, their photo or service cover, the big offer ("20% OFF"), the condition ("Mon–Wed · only 3 spots"), the handle/URL, and an optional QR. Rendered in the **site language**, with an ES/EN toggle.
- **Instagram/TikTok:** there's no API to post a story for them. The realistic flow is **"Save image + copy caption"**, then the native share sheet (Web Share API with the file on mobile). Be honest about it in the UI: "Image saved. Open Instagram → Story". Pre-written caption + hashtags in ES/EN.
- **WhatsApp:** `wa.me/?text=` with caption + link. This is likely the #1 channel in MX, so make it the first button for ES sites.
- **QR:** on-screen fullscreen (to show at the counter) + a printable A6 card PDF ("Escanea y reserva con 20%").
- **Personal promos (story 8):** share = "Send to Ana" → WhatsApp/email prefilled to *her*, using the client's contact from the talent's client list. Tulala sends the email; WhatsApp opens on the talent's phone.

---

## D. UX

### D1. Entry points

1. **Header:** a `Promos` icon (tag) with a dot when something needs attention (sold out, ending soon, suggestion).
2. **Promos page** (`/talent/promos`): list + results.
3. **Contextual callouts → Quick-create drawer** (the real growth engine):

| Where | Trigger | Callout copy | Prefilled template |
|---|---|---|---|
| Today / Home | Next 3 days < 30% booked | "Your Tuesday is empty. Fill it?" | Quick promo, those days |
| Calendar slot | Long-press an empty slot or a cancellation event | "Fill this slot" | Last-minute (single slot) |
| Cancellation notification | Booking cancelled < 48h out | "4 PM just opened. Offer it at 40%?" | Last-minute |
| Clients list | ≥1 client lapsed 60d | "5 clients haven't come back in 2 months" | Come back (bulk personal) |
| Client detail | Lapsed client | "Send Ana a welcome-back offer" | Come back (one client) |
| Service card | Service with 0 bookings in 30d | "Boost this service" | Quick promo, scoped |
| Site just published | First 7 days of a site | "Launch week offer?" | Launch |
| Calendar, holiday ahead | 3 weeks before Mother's Day / Buen Fin / Valentine's / Christmas (MX + US calendar) | "Mother's Day is in 3 weeks" | Holiday package |

### D2. Promos page (390px)

```
┌───────────────────────────────┐
│ Promos                  [+ New]│
│ ┌───────────────────────────┐ │
│ │ This month                │ │
│ │ $1,800 earned · $360 given│ │
│ │ 6 bookings · 2 new clients│ │
│ └───────────────────────────┘ │
│ [Live 2] [Scheduled 1] [Past] │
│ ┌───────────────────────────┐ │
│ │ ● Empty week 20%    LIVE  │ │
│ │ Mon–Wed · 2 of 3 left     │ │
│ │ ▓▓▓▓▓▓░░░  ends Wed       │ │
│ │ [Share]  [⋯]              │ │
│ └───────────────────────────┘ │
│ ┌───────────────────────────┐ │
│ │ ● Tuesdays 15%   EVERY TUE│ │
│ │ 4 uses this month         │ │
│ └───────────────────────────┘ │
│ ┌───────────────────────────┐ │
│ │ 💡 Suggested: Your Thursday│ │
│ │ is empty  [Create]        │ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

### D3. Create flow: template first, 2–3 taps

**Step 1 (pick a reason).** 8 template tiles with icons, no form:

`Fill my week` · `Slow day (repeat)` · `Last-minute slot` · `Free extra` · `Bring a friend`* · `Secret code` · `Launch` · `Holiday` · `Come back` · (`Custom` at the bottom)
*v1.1

**Step 2 (one card, smart defaults, tap to change).** Example: Fill my week:

```
┌───────────────────────────────┐
│ Fill my week              ✕   │
│                               │
│  20% off   [10][15][20][30] % │
│  on        All services  ›    │
│  for       Mon 13 – Wed 15 ›  │
│  only      first 3 bookings › │
│                               │
│  ┌─ Preview ───────────────┐  │
│  │ Gel mani                 │  │
│  │ ~~$450~~  $360  -20%     │  │
│  │ 🔥 2 of 3 left · Mon–Wed │  │
│  └──────────────────────────┘  │
│  You'd earn ≈ $1,080 if full   │
│  ▸ More options (code, who…)   │
│                               │
│ [ Go live now ] [Schedule]    │
└───────────────────────────────┘
```

- **Live preview** toggles: Site card · Calendar slot · Checkout. It uses real service data.
- **"You'd earn ≈"** line: honest math (price × uses − discount − Stripe − 1.5%). It sets expectations and nudges against crazy discounts.
- **Guard nudges inline:** >50% off → "That's a big discount. Sure?"; overlapping promo on the same service → "Tuesdays 15% also applies. Clients will get the better one (20%)".
- **Step 3:** Share sheet opens automatically on "Go live".

**Advanced ("More options")** collapsed: unlock (auto/code/link), audience, per-client limit, time of day, min spend, payment rule, a description shown to clients. A barber never needs to open it (per the "settings must not overwhelm" rule).

### D4. Promo detail

Header with status + big toggle (Live/Paused) · progress (uses, ends) · Share · Results (F) · Bookings that used it (list) · Edit · Duplicate · End now.

---

## E. Client side

| Surface | Treatment |
|---|---|
| Service card on site | Strike-through price + badge `-20%` / `Free lashes` / `Tuesdays -15%`. Scarcity line only when ≤5 left: "2 of 3 left" |
| Promo hero (optional) | If the talent toggles "Show on my site": a slim banner on top: "Launch week · 30% off · ends in 2d 14h" with a countdown |
| Booking calendar | Eligible days/slots get a small tag dot + "-15%" under the time. Non-eligible stay clean |
| Code entry | Collapsed link "Have a code?" at checkout. Never a big empty field (it makes people leave to search codes). Case-insensitive, trims spaces |
| Checkout breakdown | `Gel mani $450` / `Empty week (-20%) −$90` / `Lashes (free with Full glam) $0 ~~$250~~` / `Total $360 MXN` / small: "≈ US$20" (per the currency rule) |
| Pre-applied via link | Toast: "Your 20% off is applied ✓" + the promo pill on every price |
| Promo gone | Honest + an alternative: "This offer just sold out. Regular price is $450. [Book anyway] [Get notified next time]" (the second button feeds the talent's client list, opt-in). Never silently charge full price: if the promo disappears during a hold, show the change *before* payment |
| Expired code | "LUZ10 has ended." Not "invalid" |
| Personal offer | "Ana, this one's just for you 💛 20% off until Oct 28" (named, warm) |
| Loyalty (v2) | Progress dots ●●●●○ "1 more visit for a free add-on" on the booking confirmation + client account |
| Receipt/email | Shows the promo name and the amount saved: "You saved $90" |

---

## F. Results & insights

Per promo:

```
Empty week 20%                     ENDED
┌─────────┬─────────┬─────────┐
│ 3       │ $1,080  │ $270    │
│ bookings│ earned  │ given   │
├─────────┼─────────┼─────────┤
│ 2 new   │ 1 back  │ 41      │
│ clients │ client  │ link opens│
└─────────┴─────────┴─────────┘
Sold out in 19 hours 🔥
💡 Next time: it sold out fast, so try 15% or 5 spots.
[Run it again]
```

- Metrics: uses, gross before discount, **net earned** (after discount, before fees; show fees on tap), discount given, new vs returning, link opens / views → bookings (conversion), time-to-sell-out, **repeat rate** (did promo clients come back within 60d: the real ROI, shown after 60d).
- **Suggestions engine (rules-based v1, not AI):**
  - Sold out < 24h → "Lower the discount or add spots"
  - < 30% used → "Share it again" / "Try WhatsApp" / "Bigger discount"
  - Mostly returning clients on a "new client" intent → "Restrict to new clients"
  - Discount given > 40% of gross → warning
- Dashboard roll-up: a "This month" card on the Promos page + one line on the talent home.
- **No vanity metrics without context.** Always pair "given" with "earned".

---

## G. Guardrails

### G1. Plan gating
- **Free plan:** sees the Promos page with real templates and the live preview, but "Go live" opens an upgrade sheet ("Promos are part of Pro. Your 20% offer is ready, go live after upgrading"). The draft is kept, so it publishes the moment they upgrade (no lost work = high conversion).
- *Possible free taste:* 1 promo/month on free? → open question Q2.
- Callouts (D1) show to free users too: they're the best upgrade trigger we'll have.

### G2. Abuse limits
- Per-client limit identity = customer record matched on **email OR phone** (normalized), and the Stripe card fingerprint as a soft signal for "new client" promos.
- Code brute-force: rate-limit code attempts (5/min/IP+session), generic error messages.
- Personal promos: bound to the customer id. Using one requires being signed in or confirming the same email/phone via OTP.
- Talent-side sanity: max 90% off on percent (100% = use "Comp/free booking", a separate explicit action). Fixed amounts can't exceed the price. Warn > 50%.
- Self-dealing: the talent can't redeem their own promos as a client (same user id).
- "Book then cancel to hoard" on first-N: holds expire in 10 min; max 1 active hold per client per promo.

### G3. Money

| Question | Recommendation |
|---|---|
| Platform 1.5% fee base | **The discounted price actually charged.** Fee on money we don't move is indefensible to talents, and it matches Stripe (Stripe fees are on the charged amount anyway). |
| Free add-on | Fee on the charged price only (the add-on is $0). |
| Package credits | Fee charged once at package purchase (on the paid amount). Credit redemptions = $0 charge, no fee. |
| Deposit + promo | The discount applies to the **total**. The deposit % is taken from the discounted total. Pay-in-full discount (13) is just a promo with `payment_rule = full_upfront`, so it's in the eligible set only when the client picks "Pay in full". The checkout shows both options with the price difference: `Pay $90 deposit now` vs `Pay $405 now (save $45)`. |
| Who funds the discount | Always the talent (agency-funded in story 14 = later; the data model keeps `funded_by`). |
| Currency | A promo inherits the talent's primary currency. A fixed amount is stored in **cents + currency** (existing constraint). Percent works in any currency. Show ≈US$ line per the currency rule. |
| Taxes (IVA 16% MX) | The discount reduces the taxable base (it's a price reduction at the time of sale, not a rebate). Show tax after the discount. If the talent's prices are tax-inclusive, keep them inclusive and recompute. |
| Receipts/invoices | Line-level discount with the promo name. CFDI later: discount goes in the `Descuento` field per concept (design the line snapshot now so CFDI is just mapping). |
| Stripe | We compute the price ourselves and send the final amount (Payment Intent), **not** Stripe Coupons. Keeps one engine across bookings, products, Stripe MX/US and USDC. Store a snapshot on the order line: `list_cents, discount_cents, promo_id, promo_label`. |
| Refunds | Refund ≤ amount paid. Never refund at list price. |

### G4. Language
- All promo client copy is generated from templates in **ES + EN** with the site's default language. The talent can override the title/description per language (the second language is optional; it falls back to an auto-translation they can edit).
- The talent's typed promo name ("Semana vacía") is internal by default; the client sees a generated title unless they override it.
- No em dashes in the copy. Say "talent/profesional" in the copy shown to Oran.

---

## H. Missed stories, edge cases, and what not to build

### H1. More stories worth having
16. **Birthday treat:** an auto personal offer on the client's birthday month (needs birthdate opt-in; v2).
17. **Referral:** a client gets a personal link. A friend books → the friend gets 10%, the referrer gets a free add-on (v2, built on personal promos + loyalty).
18. **Off-peak hours:** 10–12 weekday mornings, 10% off (a time-of-day window: v1 data, v1.1 UI).
19. **Review thank-you:** after a review, the client gets 10% off the next visit (v2).
20. **Group/event discount:** bridal party 4+ → 15% (min-qty rule; v1.1 alongside bring-a-friend).
21. **Gift cards:** buy $1,000, get $1,200 (credits product: pairs with packages, v2).
22. **Waitlist flash:** a cancellation slot is offered to the waitlist first at 20% (v2, after waitlists exist).
23. **Comp / free booking:** the talent gives a 100% free session to a friend/model (explicit action, no Stripe, no fee).

### H2. Edge cases to decide or handle
- A promo created while the client is mid-checkout → it's not applied retroactively unless the client re-enters the cart. The confirmation only shows what was quoted.
- A talent changes the service price while a fixed_price promo is live → the promo price wins only if it's lower. If the new list price is lower than the promo price, hide the badge.
- A timezone change by the talent → windows are stored as local date + tz, re-evaluated.
- DST in the US (MX has no DST since 2022, but US clients do) → evaluate in the talent tz only.
- A service deleted → the promo scope shrinks. If it's empty, auto-pause + notify.
- A plan downgraded with live promos → existing ones run to their end (no rug-pull on clients); no new ones.
- Talent account paused/suspended → promos paused, links show "unavailable".
- A multi-service cart where only one service is in scope → the discount applies to that line only, and "first N" counts once per booking, not per line.
- Bring-a-friend with a different service for the friend → 50% applies to the **cheaper** of the two lines (industry norm, fair to the talent).
- A client with two personal offers → best wins (A7).
- Booking via an agency (talent is in an agency roster) → which promos apply? Recommendation: talent promos apply only on the talent's own site/hub booking; agency bookings use agency promos (story 14 later).
- Code collisions with other talents → not an issue: unique per tenant (existing design ✅).
- Hub `/t/` profile vs custom site → the same promo works on both (one deep link resolver).

### H3. NOT in v1
- Stacking toggles, BOGO math beyond "second guest", tiered ("spend 1,000 get 15%, 2,000 get 20%").
- Packages/credits and loyalty programs (v2: they need a ledger and get their own design pass).
- AI-written suggestions / dynamic pricing / auto-promos without the talent's tap.
- Posting directly to Instagram/TikTok via API.
- Agency multi-talent push (story 14).
- A/B testing promos.
- CFDI invoice integration (snapshot data only).
- Promo marketplace / discovery feed across talents ("deals near you"): tempting, but it changes the brand. Later decision for Oran.

---

## I. Data model (shapes the design; extends `tenant_promo_codes`)

```
promos   (evolves tenant_promo_codes)
  id, tenant_id, created_by
  name                       -- internal
  template_key               -- 'fill_week' | 'slow_day' | 'last_minute' | 'free_extra' | 'friend' | 'secret_code' | 'launch' | 'holiday' | 'come_back' | 'custom'
  offer_kind                 -- percent | fixed | fixed_price | free_addon | second_guest | pay_in_full | free_gift
  value, currency            -- existing constraints; free_addon → addon_id
  addon_id / gift_product_id
  scope_kind                 -- all_services | services | products | all
  scope_ids uuid[]           -- or a join table promo_targets (prefer join table: FK integrity)
  min_subtotal_cents, min_qty
  audience                   -- public | new_clients | returning | lapsed | one_client
  lapsed_days, customer_id   -- for lapsed / one_client
  unlock                     -- auto | code | link
  code                       -- nullable now (auto promos have no code); unique (tenant, upper(code))
  link_slug, link_token_hash
  applies_on                 -- appointment | purchase
  starts_at, ends_at, tz
  weekdays smallint[], time_from, time_to, slot_id
  max_uses, per_client_max, budget_cap_cents
  payment_rule               -- any | full_upfront
  show_on_site bool, show_countdown bool
  title_i18n jsonb, description_i18n jsonb
  visual_style
  funded_by                  -- talent | agency (future)
  is_draft, is_paused, archived_at
  parent_promo_id            -- duplicates/repeats lineage (for "vs last time" insights)

promo_redemptions  (evolves tenant_promo_redemptions)
  id, promo_id, order_id | booking_id, line_id
  customer_id
  status                     -- held | confirmed | released | voided
  hold_expires_at
  list_cents, discount_cents, currency      -- snapshot; the source of truth for results
  source                     -- auto | code | link | personal
  created_at
  UNIQUE (order_id, promo_id); one price promo per line enforced in app + check

promo_events (analytics, light)
  promo_id, kind ('view','link_open','share','code_fail'), at, session_hash
```

Note the existing `UNIQUE (order_id)` on redemptions ("one code per order") must become **one price promo per line, gifts allowed alongside**. That's exactly the stacking decision the existing comment says nobody has made. A7 makes it.

Status, uses-left and results are **derived** from redemptions. No counters (keeps the existing table's philosophy).

---

## J. v1 / v1.1 / v2 split

| | Scope | Stories covered |
|---|---|---|
| **v1** (ship first) | Offers: percent, fixed, fixed_price, free_addon. Audience: public, code, link, new clients, one client. When: window, weekdays, single slot. Limits: first N with holds, per-client. Lifecycle + safe edit + duplicate/repeat. Promos page + header + 4 callouts (empty days, cancellation, lapsed client, service card). Templates. Live preview. Share sheet (link, code, QR, WhatsApp, story/post image save). Client badges, "x of N left", code entry, breakdown, honest sold-out. Results card + rules-based tips. Paid gating with kept draft. Bookings only. | 1, 2, 3, 4, 6, 7, 8, 10, 15 |
| **v1.1** | Products/orders scope + free_gift. second_guest/min-qty. pay_in_full. Time-of-day UI. Budget cap. Lapsed bulk send. Holiday calendar callouts. | 5, 11, 13, 18, 20 |
| **v2** | Credits ledger: packages + gift cards. Loyalty programs (punch cards). Referral. Birthday. Waitlist flash. Agency push + align with the admin `discounts` UI. CFDI. | 9, 12, 14, 16, 17, 21, 22 |

Rough sizing (for Cursor planning): v1 ≈ 1 migration (evolve 2 tables + events) + the price engine module (pure, heavily unit-tested) + 3 surfaces (talent page/drawer, public site badges, checkout). That's 4–5 PRs. The **price engine as a pure function** `quote(cart, client, now, promos[]) → lines + applied + rejected[reason]` is the heart: build it first, test it to death, and every surface just calls it.

---

## K. Open questions for Oran (each with my recommendation)

| # | Question | My recommendation | What I do on GO |
|---|---|---|---|
| Q1 | 1.5% fee on the discounted or list price? | **Discounted (charged) price.** Fair, matches Stripe, easy to explain | Spec the fee base in the engine + receipts |
| Q2 | Free plan: no promos, or 1 live promo at a time as a taste? | **1 live promo, public auto only (no codes/personal).** Gets them hooked; codes/personal/results history = Pro | Gate in v1 |
| Q3 | Stacking: "best deal wins, free extras stack". OK as the only rule for v1? | **Yes** | Lock A7 |
| Q4 | Talent cancels → client keeps the promo right for 14 days? | **Yes** (fairness, builds trust) | Implement as a personal re-issue |
| Q5 | Show scarcity "x of N left" by default? | **Yes, only when ≤5 left** (honest scarcity, never fake) | Default on |
| Q6 | Max discount cap: 90% (100% = separate "free booking")? | **Yes** | Validation + comp action |
| Q7 | WhatsApp as the first share button for ES sites? | **Yes** | Order the share sheet by site language |
| Q8 | Do talent promos apply to bookings that come through an agency? | **No** in v1 (talent site/hub only) | Scope the resolver |
| Q9 | Packages/credits (12) are a big, sellable feature. Fast-track v2 right after v1, or after payments settle? | **After Stripe MX payout is stable**: credits are stored money, so they need refunds + accounting nailed first | Separate design doc |
| Q10 | One engine for talent + business admin now (extend `tenant_promo_codes`), aligning the admin UI later? | **Yes, one engine now.** The repo already killed two rival discount stores | Migration plan evolves the existing tables |

---

## Next steps (PM)
1. Oran answers Q1–Q10 (or "go with recommendations").
2. I write the v1 Cursor brief: PR1 = migration + pure `quote()` engine + tests; PR2 = talent Promos page + create drawer; PR3 = public badges + checkout; PR4 = share kit + visuals; PR5 = results + callouts.
3. Notion: an epic card "Promos engine v1" + a card per PR, tagged "Claude found / design".

---

# v1.1 additions

## L. PM challenges, answered

### L1. "First N" when payment happens at the appointment

The risk: no money is taken, so a spot can be hogged or end in a no-show.

**Hold rules**

| Flow | Hold starts | Hold ends |
|---|---|---|
| Instant book, pay online | At checkout (slot + promo chosen) | Payment success → confirmed · 10 min idle → released |
| Instant book, pay at appointment | At checkout | Phone confirmed → confirmed · 10 min → released |
| Request-to-book | On request submit | Talent accepts → confirmed · declines or 24h no answer → released. The talent sees "Uses 1 of your 3 promo spots" on the request |

- A client can have at most **one active hold per promo**.
- **Per-client cap** = 1 use per promo (the default, editable on paid plans). Identity = **normalized phone (E.164) OR email**, so either one matching counts as the same person (see L2).
- **Phone is required** to claim any limited-spots promo. Otherwise the cap is meaningless.

**No-shows**
- A no-show seat is **consumed, not returned**. The promo already did its job of filling the slot, and returning it would let a no-show game the counter.
- The client gets a no-show mark with this talent. **2 no-shows → that client is no longer eligible for this talent's limited promos.** This is silent: they simply see regular prices.
- The 24h reminder includes "¿No puedes venir? Libera tu lugar" (one tap). A release made ≥4h before the appointment returns the seat and does not count as a no-show.

**Deposit option, per promo:** "Pedir anticipo para apartar"
- Default **ON** for limited-spots promos when the talent has Stripe connected. Default OFF for open promos (Tuesdays).
- Amount = the talent's normal deposit rule, or 20% of the *discounted* price if they have none, with a minimum of $50 MXN / US$3.
- No Stripe connected → the option is greyed out with the hint "Conecta pagos para pedir anticipo". Request-to-book with a 24h acceptance window becomes the protection instead.
- The deposit is refundable under the talent's normal cancellation policy. On a no-show, the deposit is kept per policy.

### L2. Abuse

| Threat | v1 defence |
|---|---|
| Same person, new emails | Identity is **phone-first**: one phone = one person. "New client" = no completed booking or order with this tenant by **phone OR email** (plus the Stripe card fingerprint as a soft signal when they pay online). Phone OTP is **v1.1**, only for limited-spots promos with no deposit, because SMS/WhatsApp OTP costs money. |
| Close-friends code leaks | Code promos get a default **max uses = 20** (editable) and an optional **"Solo clientas que ya me conocen"** audience (returning clients only). For close friends this usually fits, and a leaked code is useless to strangers. |
| Screenshotted / shared code | **Leak guard** (on by default for codes): if new-client attempts in 1h exceed 3× the code's normal daily rate (min 5), the code **auto-pauses** and the talent gets "LUZ10 se está usando mucho por gente nueva. ¿La dejas activa?" with three choices: [Mantener] [Pausar] [Cambiar código]. **Rotate** = a new code, while the old one stays valid only for holds already in progress. |
| Personal offers forwarded | Personal offers get **single-use generated codes** (`ANA-7K2Q`) bound to customer_id + phone. Redeeming one requires the same phone or email at checkout. If forwarded, the stranger sees "Esta oferta es personal". |
| Brute-forcing codes | 5 attempts/min per session+IP and 20/day per phone, with a generic error. |
| Talent self-redemption | Blocked (same user id). |

### L3. Time zones and dates

**Rule 1: everything is evaluated in the talent's site time zone (IANA, e.g. `America/Cancun`).** Promo rules are stored as local wall-clock values (`date`, `time`, weekday) + `tz`, never as UTC instants. The client always sees times labelled in the talent's zone (as booking already does).

**Rule 2: the talent picks the date basis per promo, in plain words.** The template sets a default:

| Option (UI copy) | Meaning | Default for |
|---|---|---|
| **"Citas en estos días"** (Appointments on these days) | The appointment's start falls in the window/weekdays | Fill my week, Slow day, Last-minute, Off-peak |
| **"Reservas hechas en estos días"** (Bookings made during these days) | The booking is *created* in the window. The appointment can be later, up to an **"usar antes de"** (use by) date (default: end + 60 days) | Launch, Holiday, Secret code, Come back |

The preview spells it out: "Ej: si alguien reserva hoy para el martes, ✅ aplica".

| Case | Resolution |
|---|---|
| Booked today (Sun) for a Tuesday promo, appointment basis | ✅ applies (the appointment is Tuesday) |
| Booked Tue for next Friday, appointment basis Tuesday promo | ❌ (the appointment is Friday) |
| Booked during the launch window for 3 weeks later, booking basis | ✅ if before the "use by" date |
| Window crosses midnight (Fri 22:00 → Sat 02:00) | Allowed. The slot qualifies if its **start** is inside the window. The window belongs to the weekday it **starts** on ("Viernes noche") |
| DST week (US talents; MX has no DST since 2022) | Wall-clock rules, so "Tue 10–14" stays 10–14 local on DST weeks. On the transition night, the non-existent hour is skipped and a repeated hour counts once (first occurrence). Unit-tested in the engine |
| Promo `ends_at` | Inclusive to **23:59:59 local** on the end date. Copy: "hasta el miércoles 15" |
| Talent changes their time zone | Rules keep their local values and are re-evaluated. Existing bookings keep their snapshot |

### L4. Attribution

- Each share button produces its own URL with a short source tag: `/p/<slug>?via=ig_story | ig_post | tiktok | wa | qr | link | email`. There is no PII and no UTM soup. A printed QR is `via=qr_print`, and the on-screen QR is `via=qr`.
- On arrival, the tag is stored **first-touch** in the promo session cookie (7 days), then written on the redemption as `source_channel`. A code typed with no link = `code`, and an auto promo found on the site = `site`.
- Link opens are logged as `promo_events(kind='open', via)`, so the result card can show the funnel per channel:
  ```
  WhatsApp   22 opens → 2 bookings
  IG story   41 opens → 1 booking
  QR          6 opens → 0
  ```
- **New vs returning** is snapshotted on the redemption at confirmation time (`client_status = new | returning | lapsed`), computed by phone OR email against this tenant's completed bookings and orders. It never recomputes later, so results don't drift.

### L5. Smart callouts that help instead of nagging

- **Budget:** at most **1 callout per day**, 3 per week, across all surfaces. The highest-value one wins, in this order: cancellation slot > empty days > lapsed clients > holiday > idle service > launch.
- **Every callout has** [Crear] · [Ahora no] (snoozes that type for 7 days) · [No mostrar más] (per type, reversible in Promos → Sugerencias).
- **Auto-quiet:** if a talent dismisses a type 3 times in a row, it stops for 30 days.
- **Data-based triggers, showing the data:**

| Callout | Fires only when | Copy shows |
|---|---|---|
| Empty days | Availability is set · next 3 days < 30% of open hours booked · no live promo already covers those days · talent has ≥3 past bookings (otherwise → Launch) | "Martes 15: 0 de 6 horas reservadas" |
| Cancellation | Cancelled slot is ≥3h away, inside working hours | "Se liberó tu cita de las 4 PM" |
| Lapsed clients | ≥1 client with ≥2 past visits, last one >60 days ago, with a contact | "3 clientas no vienen hace 2 meses" |
| Idle service | Published service, 0 bookings in 30 days, while others are booked | "Uñas acrílicas: sin reservas este mes" |
| Holiday | 21 days before a holiday on the MX/US calendar for the talent's country, and only once per holiday | "Día de las Madres en 3 semanas" |
| Launch | Site published in the last 7 days, no promo yet | "Tu sitio es nuevo. ¿Oferta de lanzamiento?" |

- We track shown / accepted / dismissed per type, which lets us tune thresholds with real data.

### L6. Prices and rounding (MXN), with one price source

**Rounding rule:**
- MXN: the **final price rounds half-up to whole pesos**, and the discount = list − final. Lines always sum exactly, and a peso never goes missing. Example: $455 at 15% → $386.75 → **$387**, discount $68.
- USD: round to the cent. Show `.00` only if the talent's other prices do.
- Percent is applied **per line**, never on the order total. That way the checkout lines, the card and the receipt are all the same number.

**Copy:**
- Cards and service page: "~~$500~~ **$350**" (visual) with the screen-reader text "Antes $500, ahora $350".
- Checkout: `Antes $500 · Ahora $350 · Ahorras $150`.

**One price source (this is the real fix behind the prod "Desde" QA finding):**
- Today the headline "Desde" comes from `web/src/lib/directory/price-from.ts` → `pickHeadlinePrice` (~10 callers), while service pages and checkout read prices in their own ways.
- Rule for promos: **no surface renders a price itself.** Every surface (directory card, service page, "Otros servicios", calendar slot, checkout, OG image, receipt) calls `displayPrice(offering, ctx)`, which is `pickHeadlinePrice` / the variant price fed through `quote()`.
- **"Desde" with a promo:** if the promo covers the headline variant → "Desde ~~$500~~ $350". If it covers only some variants → keep "Desde $500" + the badge "‑30% en algunos servicios". Never show a "Desde" that no bookable item matches.
- **Contract test:** the same offering + promo rendered through every surface helper must give the same final number.
- **The prod "Desde" bug should be fixed first, as PR0,** independent of promos (see M).

### L7. Downgrade from paid to free

| Thing | What happens |
|---|---|
| Confirmed bookings at a promo price | **Always honoured.** The price is snapshotted |
| Live promo with an end date | Runs to its end date, **capped at 30 days** after the downgrade |
| Open-ended / recurring promo (Tuesdays) | Ends **14 days** after the downgrade. The talent is told on the downgrade screen: "Tus 2 promos activas terminan el 28 oct" |
| Scheduled, not started | Goes back to Draft, with the banner "Reactiva con Pro" |
| Personal offers already sent | Valid until their own expiry (a promise was made to a client) |
| Codes | Same cap as their promo |
| Results history | Read-only and blurred behind upgrade, except the most recent promo's card |
| Lifetime trial | Not re-granted (it's lifetime) |
| Re-upgrade | Drafts and ended promos can be duplicated straight away |

### L8. SEO and the promo landing page

- **Promo landing** `/p/<slug>` (site) and `/t/<handle>/p/<slug>` (hub). It shows the offer, the eligible services with discounted prices, a countdown if enabled, and a one-tap "Reservar".
- **OG image per promo:** the same renderer as the share visuals, in the site language, with no personal names. For personal or link-token pages, the OG shows a generic "Una oferta para ti" card.
- **Indexing:** **all promo pages are `noindex`** and canonical to the service page, and none are in the sitemap. Personal and code pages also send `X-Robots-Tag: noindex, nofollow`. (Promos are temporary. Indexed promo pages become dead search results.)
- **Ended / sold out / paused** pages still return **200** (stories and QR prints live forever), and still try to convert:
  ```
  ┌───────────────────────────────┐
  │  Esta promo terminó 💛         │
  │  Pero puedes reservar:         │
  │  [Live promo, if any]          │
  │  Gel mani        $450  ›       │
  │  Full glam       $1,200 ›      │
  │  [Avísame de la próxima]       │  ← opt-in (L10)
  └───────────────────────────────┘
  ```
- Deleted / archived after 180 days → the page shows the talent's home with "Esta promo ya no está disponible".

### L9. Accessibility, one-handed use at 390px, and the ES copy library

**One-handed rules for the create drawer:**
- A bottom sheet. **All primary actions sit in the bottom 40%** (thumb zone), with a sticky footer CTA "Publicar".
- Chips instead of dropdowns:
  - Percent: `10 · 15 · 20 · 30 · Otro`
  - Dates: `Esta semana · Este finde · Próxima semana · Elegir`
  - Spots: `3 · 5 · 10 · Sin límite`
- Steppers (−/+) for numbers. No typing is required for the common path.
- Touch targets ≥ 44×44 px, and a drag-down to close with a confirmation if the draft has edits (the draft is auto-saved anyway).

**Screen readers and motion:**
- The strike-through price has visually-hidden text ("Antes 500 pesos, ahora 350 pesos"), because `<s>` isn't announced.
- Countdowns update `aria-live="polite"` at most once a minute. The "2 of 3 left" text is real text, not only a progress bar colour.
- `prefers-reduced-motion`: no ticking seconds and no confetti.
- Contrast is AA on badges in every theme. Badge colour comes from theme tokens, with text always present.

**ES copy library v1** (EN alongside in the i18n files, no em dashes):

| Key | ES |
|---|---|
| tpl.fill_week | Llena tu semana · "Descuento para tus días libres" |
| tpl.slow_day | Día tranquilo · "Cada martes con descuento" |
| tpl.last_minute | Último momento · "Llena este espacio" |
| tpl.free_extra | Regalo extra · "Un extra gratis con tu servicio" |
| tpl.secret_code | Código secreto · "Solo para quien tenga el código" |
| tpl.launch | Lanzamiento · "Para tus primeras clientas" |
| tpl.holiday | Fecha especial · "Día de las Madres, Buen Fin, Navidad" |
| tpl.come_back | Te extraño · "Oferta personal para que regrese" |
| tpl.courtesy | Cortesía · "Una cita sin costo (influencer, regalo, compensación)" |
| badge.percent | -{n}% |
| badge.free_extra | {addon} gratis |
| badge.weekday | Martes -{n}% |
| scarcity | Quedan {n} de {total} |
| price.was_now | Antes {was}, ahora {now} |
| checkout.saved | Ahorras {amount} |
| code.link | ¿Tienes un código? |
| code.ended | El código {code} ya terminó |
| code.personal | Esta oferta es personal |
| code.better | Ya tienes una mejor oferta ({promo}), no necesitas el código |
| gone.sold_out | Esta promo se agotó |
| gone.ended | Esta promo terminó |
| gone.cta_notify | Avísame de la próxima |
| applied | Tu {n}% de descuento ya está aplicado ✓ |
| personal.greet | {name}, esta oferta es solo para ti 💛 |
| release_spot | ¿No puedes venir? Libera tu lugar |
| caption.fill_week | Tengo espacios esta semana ✨ {n}% de descuento lunes a miércoles, solo {spots} lugares. Reserva aquí: {link} |
| caption.launch | ¡Abrí mi nuevo sitio! 🎉 {n}% para mis primeras {spots} clientas. {link} |

The copy library lives in the i18n files under `promos.*` and is owned by the template definitions, so every template ships with its full ES and EN copy or it doesn't ship.

### L10. Notifications

**To the talent** (in-app always; email/push per their existing notification preferences):

| Event | When | Copy |
|---|---|---|
| Live | On start, if it was scheduled | "Tu promo Día de las Madres ya está activa" |
| Almost gone | When uses left hits 2 (only if max ≥ 5) | "Quedan 2 lugares en Llena tu semana" |
| Sold out | Hits 0 | "¡Agotada! 3 citas, $1,080 ganados" (with the result card) |
| Expires tomorrow | 24h before the end, if <80% used | "Tu promo termina mañana. ¿Compartirla otra vez?" |
| Leak guard | See L2 | Action buttons |
| Ended | At the end | The result card + "Repetir" |

If 3 or more notifications land in 1 hour, they're bundled into one.

**To clients: opt-in only, never spam:**
- Opt-in points:
  - An **unchecked** checkbox at checkout: "Quiero recibir ofertas de {talent}".
  - "Avísame de la próxima" on the sold-out or ended pages.
- The talent action **"Avisar a mis clientas"** on a live promo sends email to **opted-in clients only**, max **2 per client per talent per month**, with one-tap unsubscribe in every email (compliant with LFPDPPP / CAN-SPAM).
- Personal offers (come back) are *sent by the talent*: WhatsApp from their own phone, or a single email if that client opted in. Tulala never bulk-messages clients who didn't opt in.
- Clients who used a promo get **no** automated marketing unless they opted in.

---

## M. PR plan (hold coding until PM GO)

Rules for every PR:
- Branch off the latest `origin/main`, never stacked.
- Migrations: `db:push` before merge. Order: file → apply → verify → record.
- No local typecheck. Label `full-ci` once when ready.
- No Vercel previews per the cost rules: localhost QA on :3001.
- Small PRs ride integ/* waves.

| PR | Contents | Depends on | Tests / proof |
|---|---|---|---|
| **PR0 · One price source** (live bug, ships regardless of promos) | Audit every price render (directory card, service page, "Otros servicios", checkout, emails). Route all of them through one `displayPrice()` that wraps `pickHeadlinePrice` / variant price. Fix the prod "Desde" mismatch | – | A contract test proving every surface gives the same number. Before/after on Jor localhost |
| **PR1 · Migration + pure engine** | **Migration:** evolve `tenant_promo_codes` → promo columns from section I (offer_kind, scope join table `promo_targets`, audience, unlock, nullable code, date_basis + use_by, local-time rules + tz, weekdays, slot, deposit_required, leak_guard, i18n, is_draft/paused/archived, parent_promo_id, is_trial). Evolve `tenant_promo_redemptions` (status held/confirmed/released/voided/no_show, hold_expires_at, list/discount snapshot, source_channel, client_status, booking_id + line). Drop `UNIQUE(order_id)` → one *price* promo per line. Add `promo_events` and courtesy fields (`courtesy_reason`). RLS: tenant-scoped. No anon-executable DEFINER RPCs. **Engine:** `web/src/lib/promos/quote.ts`, pure: `quote(cart, client, now, promos) → { lines, applied, rejected: [{promoId, reason}] }` | – | Unit matrix: every offer type · best-wins + gifts stack · 90% cap · MXN half-up rounding, lines sum exactly · appointment vs booking basis · midnight-crossing · DST both directions · per-client by phone OR email · new/returning · use-by · floor at 0 / Stripe min · courtesy = 0 fee · fee on charged price. Fixtures typed (no `any`) |
| **PR2 · Redemption service** | Server: hold (transactional last-seat), confirm, release, no-show, release-my-spot, 14-day re-issue on talent cancel, reschedule re-quote, refund rules, hold-expiry sweep, leak-guard detector, code attempt rate-limit | PR1 | Concurrency test: 10 parallel holds on 3 seats → exactly 3. Cancel/no-show/reschedule table from B3 + L1 |
| **PR3 · Talent Promos UI** | Header entry, Promos page, template picker, create drawer (one-handed), live preview (calls `quote()`), detail, pause/end/duplicate/rotate code, safe-edit rules, Cortesía action, plan gating + lifetime trial + downgrade handling, ES/EN copy library | PR1, PR2 | Screenshots at 390px on Jor localhost: create → live → preview, as a free user (trial) and as Pro |
| **PR4 · Public site + checkout** | Badges, calendar tags, scarcity ≤5, code entry, pre-applied link toast, price breakdown, deposit option, honest gone states, receipts/emails with list/discount/fee | PR0, PR2 | Contract test extended to promo prices. Click-through screenshots of all 9 v1 stories |
| **PR5 · Share kit + landing** | `/p/<slug>` + hub variant, noindex + canonical, ended/sold-out converting page, OG + story/post visuals (ES/EN), QR screen + printable PDF, WhatsApp first on ES, `via=` tags | PR4 | OG render snapshots. Robots headers asserted. The ended page returns 200 |
| **PR6 · Results, callouts, notifications** | Result card + channel funnel + new/returning + gifted value + rules-based tips. Callout engine with budget/snooze/never/auto-quiet. Talent notifications + bundling. Client opt-in + "Avisar a mis clientas" with caps + unsubscribe | PR2, PR5 | Callout budget unit tests. A notification cap test |

**First move on GO:** PR0 and PR1 in parallel (they share no files). Then PR2, then PR3 + PR4 in parallel, then PR5, then PR6. I'll make the Notion epic "Promos engine v1" + 7 cards (PR0–PR6) and write Cursor briefs with exact files, the test matrix, and the no-gates rule.

**One flag for the PM:** PR0 fixes a live prod bug, so it can and should go now, ahead of the promos GO.
