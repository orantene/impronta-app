# Production human QA + Front Chat unification (for Cursor, after the current audits)

Two parts:
- **Part A:** how to find issues on production the way a human would (page builder, settings, dashboard, public site, money). Tests that pass are not enough: Oran keeps finding problems by LOOKING.
- **Part B:** the front chat: one fully working engine, with themes only changing its design.

Start this after the Built-vs-Live audit and Jorgelina's site are done. Run it on **app.tulala.digital / live talent sites**, never localhost.

---

# PART A: Human verification on production

## A1. The mindset
You are not checking "does it render". You are a picky first-time talent and a picky client. For every screen ask:
1. **Does it look finished?** No empty bands, orphan headings, stock photos where *her* content should be, broken alignment, overlaps, cut text, placeholder copy, English inside Spanish.
2. **Does it do what it says?** Every button, link, toggle, tab and menu item actually works and lands on the right place.
3. **Does it stick?** Change → save → reload → still changed → visible on the live site.
4. **Is it true?** Statuses, amounts, counts and dates match the real records.
5. **Can I get out?** A back path, close, cancel and undo exist; there are no dead ends or traps.

## A2. Techniques to use every time
- **Mockup diff:** put the design demo/mockup and the talent's live page side by side, section by section. Every section in the demo must exist with HER content. Missing = defect.
- **Edit → live diff:** make a change in the builder or settings, publish, open the live site in a fresh private window, and confirm the change is there (and nothing else moved).
- **Persona walk:** the same flow as paid (TAL-93900), Free (Valeria), fresh sign-up, visitor/client, admin. Many bugs exist for only one of them.
- **Three viewports:** 390px phone, 768 tablet, 1440 desktop. Plus the phone with the keyboard open on any form.
- **Two languages:** walk it in ES, then EN. Look for mixed languages, untranslated labels, wrong date/number formats ("Octubre De 2026"), currency formats.
- **Empty / full / extreme data:** a talent with no photo, no services, no bio; one with 30 services and long names; a 40-character name; a missing price.
- **Reload and back button:** after each step, reload and press the browser back button. State must survive; no blank screens.
- **DevTools on every page:** Console (zero errors), Network (no 4xx/5xx, no request firing in a loop), slow 3G once.
- **Click everything:** on each screen, click every clickable element once. Write down any that do nothing.
- **Visual sanity:** images load (no broken icons), nothing overlaps, consistent spacing, one primary action, no text over images without contrast, no layout jump while loading.

## A3. Surface checklists (production)

### Page builder (as TAL-93900, then Valeria)
- [ ] Opens from: dashboard "Edit site", avatar menu "Builder", Presence → My website. Lands on the right page; never blank or broken.
- [ ] Canvas = live site (same fonts, images, spacing) before any edit.
- [ ] Every section of the theme demo is present with her content (photo, services, gallery, FAQ, apps, map, footer). No empty bands or orphan headings.
- [ ] Inline text edit; image swap (upload + library); colour, font, size and button-shape changes; hide/show section.
- [ ] Paid: add / move / duplicate / delete sections; undo/redo. Free: locked with ⓘ, and the server rejects them.
- [ ] Apps: add an app block, configure it, see it live.
- [ ] Theme switch Folio ↔ Maison v2 ↔ Gridline: content kept; photo, services and apps present in all three.
- [ ] Mobile preview in the builder = live site at 390px.
- [ ] Save/publish feedback is truthful (failed save shows failed + retry). Reload keeps everything.
- [ ] Leaving with unsaved changes warns. The back arrow goes to the dashboard.

### Website Settings (each setting: change → live → revert)
- [ ] Address/subdomain, logo, pages, booking mode (book / chat / inquiry), payments, cancellation policy, pause banner, languages (ES/EN), AI assistant on/off.
- [ ] Each change visibly changes the public site in a private window; reverting restores it.
- [ ] Copy is plain, preset first, advanced hidden, ⓘ for explanations.

### Dashboard (every rail item)
- [ ] Today, Agenda, Messages, Clients, Services, Money, Presence (all tabs), Settings, Apps: each opens, has real data, has no dead buttons, has empty states that say what to do.
- [ ] The avatar menu shows the TAL code; every quick link works.
- [ ] Numbers agree across pages (a booking paid in Agenda = paid in Money = paid in Messages).

### Public talent site (as a visitor, private window)
- [ ] Hero, services with real prices, gallery, about, FAQ, map/location, footer legal links (ES → /es/legal).
- [ ] Book flow, chat, quote request, apps all work; no broken images; SEO title and description are hers.

### Money
- [ ] Stripe status truthful; fee lines right; PAID only after the webhook; refunds net of fees; cash/transfer entries; month label and totals correct; cancelled excluded.

## A4. How to report a human-found issue
One line on PM-BOARD + a screenshot, in this shape:
`[surface] [persona] [viewport] [lang]: what I did → what I saw → what I expected (screenshot)`
Classify it: **code** (fix for everyone) / **theme** (fix in the theme, re-release) / **user data** (talent content missing; guide her or fix the hydration) / **demo** (demo content). Fix the class, not the instance, and sweep all talents/themes for the same issue.

## A5. Cadence
- After every deploy: a 10-minute walk of the builder, Settings, Today, Money and the public site (TAL-93900).
- Daily: one full persona walk (rotate paid / Free / fresh / visitor).
- Before telling Oran something is "ready": the full A3 checklist for that surface, with screenshots in STATUS.md.

---

# PART B: Front Chat, one engine, themed skins

## B1. The rule (owner decision)
There must be **ONE fully working front chat engine** with every capability we built. Themes do not get their own chat. A theme only provides a **skin** (colours, type, shape, layout variant, avatar style, motion) on top of the same engine. A skin may never remove or break a function. Today there are several versions/variants built for different themes and purposes, and nobody can say which one is complete. Fix that.

## B2. What exists (inventory first, don't assume)
Map every chat/dock implementation and where it renders:
- `web/src/app/t/[profileCode]/_chat/*`: the big front-door/guest chat ("dock") engine: Card dock (frame, header, panel, services view), Guest dock (home, catalog, lineup, projects, nav, items shelf, details card), the detail chips (date, budget, headcount, location, event type), brief editor, contact editor, claim email recap, guest account toolkit, conversation status strip, expanded chat layout, help bubble, flying avatar, offering strip.
- `web/src/app/_talent-site/TalentSiteMessagesDock.tsx`: the dock on talent sites (incl. per-talent locale / voice).
- `web/src/components/messages-v5/client/*`, `chat-cards`, `chat-interactions`: the client side of Messages v5 (cards, offers, pay links, status).
- The AI assistant / agentic booking path (support-chat / talent assistant routes, AI tools for quoting, booking, pay links).
- Any theme-specific chat variants (Maison, Folio, Gridline, the Card design, Noir…) and onboarding/front-door variants.

Produce `docs/plans/front-chat/00-inventory.md`: one row per implementation: where it renders, which talents/themes use it, its capabilities, and whether it's live/partial/dead.

## B3. The capability matrix (the "complete engine" definition)
Make a matrix: capabilities as rows × implementations as columns. The complete engine must have ALL of these:
- Greeting in the talent's voice + language (ES/EN); talent avatar.
- Browse services/catalog in the chat; pick a service, variants, add-ons.
- Book: pick a time from real availability; truthful status (requested / confirmed / paid).
- Quote request for quote-type services (never the booking sheet).
- Event details chips (date, budget, headcount, location, event type) + a brief.
- Offers from the talent (accept / decline in the thread); reschedule / cancel.
- Pay link in the chat; PAID only after the webhook; receipt; tips.
- Guest identity: contact capture, email claim/recap, resume a conversation later (`?order=` cold load), guest → account.
- Attachments; status strip; expanded/fullscreen layout; mobile bottom sheet.
- **Agentic AI assistant:** answers from the real catalog and policies, books, sends the pay link, hands off to the talent when unsure, never invents prices or availability, the talent can see and override, and there is an on/off switch per talent.
- Notifications to the talent (push/email) that open the right thread.
- Everything lands in the talent's Messages v5 inbox + Agenda + Money (one record).
- Accessibility, reduced motion, 390px.

Mark each cell ✅ / partial / ❌. Pick the most complete implementation as the **base engine**.

## B4. Target architecture
- **One engine:** a single chat core (state, actions, data, AI, payments) used everywhere: talent sites, `/t/<code>`, front door.
- **Skins:** a typed `ChatSkin` contract: tokens (colours, radius, fonts, shadows), layout variant (dock / card / fullscreen / sidebar), header style, bubble style, avatar style, motion. Themes provide a skin; there is a default Tulala skin.
- **Slots, not forks:** a theme may restyle slots (header, launcher, bubbles, cards, composer) but cannot remove capabilities. A static test asserts every skin renders every capability (snapshot per skin × capability).
- **Settings drive behavior, not the theme:** booking mode, AI on/off, payments, languages come from Website Settings. The theme only styles.
- Retire duplicates behind the engine (migrate variants into skins; delete dead code).

## B5. Deliverables + order
1. `00-inventory.md` + the capability matrix (screenshots per variant, live).
2. Decision memo: the base engine, the gaps to fill, the skin contract, the migration plan (PR list). Post it to Oran.
3. Fill the gaps in the base engine (front-door owed items first: "paid" flip after payment, `?order=` cold load).
4. Convert theme variants into skins (Maison v2, Folio, Gridline first).
5. Agentic assistant fully working inside the engine (QA Story 8).
6. Proof on production: one talent per theme (Maison v2 / Folio / Gridline) runs the full chat journey (browse → book or quote → offer → pay → PAID → thread in inbox) with screenshots; the same journey with the AI assistant on.

## B6. Rules
- Never drop a function to make a theme look right; restyle it.
- One source of truth for conversations/bookings/payments (Messages v5 + Agenda + Money).
- EN + ES, no em dashes, tokens only, 390px first.
- MCP / external agent booking stays out of scope until Oran's go (the in-chat AI assistant is in scope).
