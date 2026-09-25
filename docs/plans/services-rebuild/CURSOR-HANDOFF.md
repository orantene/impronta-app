# Cursor handoff: finish the Services rebuild (Jor Beauty) 1:1 with the PDF

You are taking over the Services rebuild for the talent dashboard. The designer PDF is the spec. The demo account is Jor Beauty (Jorgelina). Everything below was found by the previous agent and is NOT yet done, or is done but not proven in a browser. Work through it in order, prove each item on localhost with a screenshot, and commit small.

---

## 0. Ground rules (read first)

**Where you work**
- Worktree: `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/services-rebuild`
- Branch: `feat/services-rebuild`. Never commit to `main`. Never merge. Never push or move the `production` branch.
- Read `web/AGENTS.md` and the root `CLAUDE.md` before your first commit.

**The spec**
- PDF pages as PNGs: `/Users/oranpersonal/Desktop/impronta-app/docs/plans/services-rebuild/pages/p01.png` to `p38.png`
- PDF text: `/Users/oranpersonal/Desktop/impronta-app/docs/plans/services-rebuild/pdf-text.txt`
- Plan and status: `docs/plans/services-rebuild/EXECUTION-PLAN.md`, `docs/plans/services-rebuild/REPORT.md` (in the worktree)
- The loop for every item: open the PDF page, open the live localhost screen, fix, reload, screenshot, commit. "Looks close" is not done. Match spacing, hierarchy, copy, states.

**Dev server**
- Start it from `.claude/launch.json`, entry `services-rebuild`. It runs `TULALA_ALLOW_DEV_SURFACES=1 npm run dev -- --port 3000` in `web/`.
- Use port **3000** only. `localhost:3000` is registered in `agency_domains`. Other ports return 404 "Host not registered".
- Right after a restart the first requests can 404 for up to about 60 seconds (host-context cache). Wait, then reload.
- Stale cookies from other ports can cause false 404s. Clear cookies if a page that worked starts 404ing.
- Arbitrary Tailwind values added after the server started (like `max-w-[660px]`, `text-[16px]`) sometimes do not compile in dev. Use an inline `style` for widths, or restart the server.
- The machine has a CPU governor: at most 2 typechecks, 1 lint and 2 dev servers at once. Register your dev server: `bash ~/.claude/tulala-dev-lease.sh grant <abs web dir> "services rebuild"`, and revoke it when done.
- Turbopack crashed once under load and wiped its cache. If pages hang, check the server log before blaming the code.

**Signing in as Jor**
- Jor's user: `orantene+jorgbeauty@gmail.com`, talent profile id `f048e578-cbae-45db-9a3b-34239abea136`, code `TAL-JORGBEAUTY`.
- The browser session on localhost was already signed in as Jor. If it expires, use the local impersonation path (`IMPERSONATION_QA_TALENT_USER_ID` in `.env.local`) or ask the owner. Never type passwords.

**Gates (the only allowed commands)**
- `cd web && npm run typecheck`. This goes through the machine-wide queue. Never run bare `npx tsc` or `eslint` because it starves every other agent.
- `cd web && npm run lint`
- Single test files: `npx tsx --test <file>`
- Check real exit codes: `npm run x > out 2>&1; echo $?`, not a pipe.

**Copy**
- Every new user-facing string needs English and Spanish. Spanish goes in `web/src/components/admin/shell/internal/dashboard-i18n.ts` (the `ES_TEXT` map). Use `copy.t("...")`. Never add a duplicate key.
- No em dashes in user-facing copy.

**Data**
- Jor is the demo account, so you may write to her items on localhost for QA. Delete every test item you create afterwards. The previous agent left none behind; keep it that way.
- Never change her live website (`book-jorgelina.tulala.digital`) without the owner's okay.

**Scope collisions**
- Another agent (you, on the Public page / My presence work) has uncommitted changes in: `ServicesHome.tsx`, `WebsiteRewardControl.tsx`, `use-offerings-editor.ts`, `offerings-types.ts`, `dashboard-i18n.ts`, `talent/layout.tsx`, `PublicPageEditor.tsx`, the admin-shell files, `next.config.ts`, `flags-registry.ts`, plus untracked `talent/presence/`, `talent/studio-kit/`, `components/talent/studio/`, `lib/talent/studio-flag.ts`, `lib/talent/website-eligibility*`. Commit that work first (task A) so the services work below starts from a clean tree.

---

## What is already done (don't redo it)

Commits on `feat/services-rebuild`, newest first:
- `c2234c107` plan update
- `bf5236242` services_catalog widget: CSS variable fix + render test
- `ae0ab5ebe` services_catalog widget: real clickable page-builder block
- `019691059` Defaults, Organize, editor, Add many, camera, reward sheet, Spanish (155 strings)
- `d31467a43` one file per services screen (`ServicesScreens.tsx` is now a barrel)
- `a9b029605` Add item type dialog (p05)
- `b91e45d31` website reward pill (p18)
- `1052dde3e` snapshot of the first rebuild

Data changes already made to Jor's account:
- All 22 items now have a cover photo from her portfolio (nails, feet, lashes, brows and face photos matched per category).

Proven on localhost with Jor's data:
- Services home list, filter chips, counts, attention banner (disappears when nothing needs attention)
- Add item dialog (p05)
- Editor for a live item (p06, p12): details card, photo tiles with Cover badge, price/duration/buffer row, booking-mode radio cards, "where it happens" chips, rule rows with Edit, client card preview with "$300 MXN · 75 min ≈ US$17", Ready to publish box
- Duplicate creates "X (copy)" as a draft and opens it in the editor
- Row menu actions list (Edit, Preview, Share, Duplicate, Hide, Archive, Move up, Move down)
- Add many: parsed 3 lines, flagged "Needs minutes", fixed it inline, published 3/3, the 3 photo-less items appeared in the attention banner (test items deleted afterwards)
- Organize screen (p33) renders her 4 categories with photos and counts

Proven only by tests, not in a browser:
- The `services_catalog` widget (7 render tests in `web/src/lib/site-admin/builder-node/services-catalog-render.test.tsx`)

Important fix already in the save path:
- `ServicesHome` `onSave` now calls `upsertTalentOffering` directly. The old `editor.saveDraft` returned null for new items because this screen never starts the hook's draft, so new items silently never saved. Don't revert this.

---

## A. Clean the tree and get the gates green (do first)

1. Commit the in-progress Public page / My presence work in coherent commits. Keep services files and presence files in separate commits.
2. A full `npm run typecheck` passed at 10:5x EST on 2026-09-24 with your uncommitted work in the tree, so the earlier `studio/primitives.tsx` error (`"md"` not assignable to `"sm" | "lg"`) looks fixed. Re-run after committing to confirm.
3. Run `npm run typecheck` and `npm run lint`. Both must exit 0.
4. Run `npx tsx --test src/lib/site-admin/builder-node/services-catalog-render.test.tsx src/lib/talent/website-reward.test.ts src/lib/talent/publication-state.test.ts`. All must pass.

Acceptance: `git status` clean, typecheck and lint exit 0.

---

## B. services_catalog widget: prove it live, then make it match her current menu design

What exists: `case "services_catalog"` in `web/src/lib/site-admin/builder-node/render.tsx` (search `SERVICES_CATALOG_CSS`). Data comes from `loadServicesCatalogSources` in `web/src/components/home/homepage-cms-data-sources.ts` (offerings + `talentOfferingsConfirmsByHand` + `talentOfferingsUsdRates`). The Select button is `OfferingCta` from `web/src/app/t/[profileCode]/_shared/OfferingCta.tsx`, which fires `tulala:offering-request` / `-instant` / `-slot`. `TalentSiteMessagesDock` (mounted on every talent-site page) listens for those.

B1. Prove it works in a browser:
- Open the site editor on localhost (`/talent/site`). Note: it hung tonight while the presence files were mid-edit. After task A it should load.
- Add a "Services menu" block to a page (it is in the add gallery as `services_catalog`).
- Preview the page. Click Select on a service. The chat/booking dock must open with that service attached.
- Check the button is visible and legible (the CSS aliases `--plt-ink`, `--plt-bg`, `--plt-hairline-strong` onto `--token-color-*` inside the block; confirm with computed styles).
- Check at 390px width: photo, name, price, button stack correctly.
- Do NOT publish this to her live site.

B2. Make it match the section on her live site (`book-jorgelina.tulala.digital/#servicios`), which the owner wants replaced by this widget:
- Eyebrow "EL MENÚ" in the accent color.
- Big serif title with the italic part: the prop `title` uses `{i}...{/i}` markers ("Servicios {i}y precios{/i}"). Right now the renderer strips them. Render the marked part in italic.
- Subtitle line ("Todos los precios en pesos mexicanos (MXN). Se paga en el estudio.").
- Stats on the right as big numbers with small uppercase labels: "22 SERVICIOS", "4 CATEGORÍAS".
- Category tabs as pills where the active one is filled dark. Clicking a tab FILTERS the list (her current site shows one category at a time). Today the widget renders anchor links to grouped sections. Build a small client island for `categoryNav: "tabs"` / `"pills"` that filters, keep the server HTML for SEO (same pattern as `StorefrontFilter`).
- Rows: square photo on the left (~120px on desktop), name, description, "2 h · duración estimada" style duration, price on the right ("$700"), outline "Seleccionar" button. Hairline dividers between rows, not boxed cards.
- Button label in Spanish must be "Seleccionar" to match. `OfferingCta` resolves its own label (Reservar / Pedir cotización). Either pass a label override or add a `ctaLabel` prop to the widget.
- Categories must follow the talent's saved order (`category_order`, see task J).
- Inspector: make sure the props (layout, categoryNav, eyebrow, title, subtitle, showStats, showPhoto, showDuration, showUsdEquivalent) are editable in `web/src/components/edit-chrome/inspectors/builder-node-content.tsx`.
- Add render tests for the italic title, tabs filtering markup and the label override.

B3. Replacing her live band is an owner decision. Prepare it (the exact page and band to swap, a before/after screenshot on localhost) and stop. Her current live "Seleccionar" links go to `https://tulala.digital/t/TAL-JORGBEAUTY#servicios` (off her site). The widget keeps the booking on her own site, which is the point.

---

## C. Product editor (p23 desktop, p24 phone)

File: `web/src/components/talent/services/EditorScreen.tsx`. Today a product only has price + "How many do you have?". The PDF needs:

C1. Stock row, three columns: PRICE, HOW MANY DO YOU HAVE? (hint "Leave empty if you make each one to order"), WHEN IT HITS ZERO (select: "Show 'Sold out', keep the page" / "Hide it"). Store the second one in `attributes.whenSoldOut`.

C2. "Does the buyer choose a size or version?" A list of checkbox rows (S · narrow nail beds, M · most hands, L · wide nail beds), each with "same price" or its own price, plus "+ Add a size or version". Note under it: "They pick one. To let them add things on top (a second set, a glue kit) use an extra instead."
- Data: `item.variants` (`OfferingVariant { id, label, amountCents | null }`). Save with `setOfferingOptions(talentId, offeringId, { variants, addOns })` in `web/src/lib/talent/offerings-actions.ts`. It replaces both lists, so pass the existing addOns back unchanged.
- New items have no id until the first save. Do what photos do: hold the variants, save the item, then call `setOfferingOptions`. Wire this through `onSave` in `ServicesHome`.

C3. "How does it get to them?" Three selectable cards:
- Pick up at the studio (shows the address, "ready the same day")
- Ship it ("Mexico only · 120 MXN · 3–5 days", editable fee and lead time)
- Hand over at their appointment ("Only for clients with a booking")
- Note: "Payment is taken in full when they buy. It shows in Money as collected the moment it sells and never touches your calendar."
- Store in `attributes.fulfillment = { pickup: { enabled, address }, ship: { enabled, feeCents, leadTime, region: "MX" }, appointment: { enabled } }`.
- Check whether checkout reads shipping. If it doesn't, say so in the report and leave a TODO; don't fake it.

C4. Header: the PDF shows "Step 3 of 4 · price, stock and handover" and a collapsed row "A product · Press-on set · almond, 24 pcs" above. The previous agent chose one scrolling editor (no steps) for services per p06. Decide with the PDF: p23 clearly draws steps for products. Match p23 for products.

C5. Client card preview for a product: "7 left · ships in 3–5 days or pick up in Cancún", size pills (S M L, one selected), "$650 MXN · + 120 shipping", full-width "Buy". The note under the card: "When the 7 are gone the button becomes 'Sold out' and the card stays so the page never has a hole..."

C6. Phone layout (p24): PRICE and HOW MANY side by side, sizes as chips "SIZES · THEY PICK ONE", fulfillment as a checklist, sticky Draft / Publish bar.

Acceptance: create a test product on Jor's account with sizes and shipping, save as draft, reopen, everything is still there, card preview matches p23. Delete it after.

---

## D. Extras (p25)

Today extras are an inline mini form at the bottom of the editor ("Options and extras"). The PDF has a dedicated "New extra" screen:
- Header "New extra", subtitle "Adds price or time to a service the client is already booking", Cancel + "Save extra".
- Card "What is the extra?": NAME, ADDS TO THE PRICE (+200 MXN), ADDS TO THE TIME (+25 min), one photo with "One photo is enough here; it shows as a small square next to the checkbox. Change".
- Card "Which services can it be added to?": two-column checkbox grid of her services with thumbnails. Footer hint like "5 of 22 · lash and brow services are not shown because the extra is for nails. Say if that is wrong." (filter by category of the service it was opened from).
- Right side "WHERE THE CLIENT MEETS IT": a booking preview for one attached service with "ADD TO YOUR BOOKING" checkbox rows (photo, name, +time, +price), total line "Total · 115 min  $1,150 MXN", and "Book · 300 MXN deposit".
- Data: `upsertAddonGroup` / `loadAddonGroups` in `web/src/lib/talent/services-settings-actions.ts` (`talent_addon_groups`, attached via `offeringIds`). Extra photos: check whether the group has a media field (`mediaUrl` exists on the type); wire upload if the column exists, otherwise report it.
- Entry points: "Create an extra" in the editor's Options and extras card; editing an existing extra from the same card.
- The Add item dialog already says extras are made from the service, so no fourth type in that dialog.

Acceptance: create an extra on localhost, attach to 2 nail services, open one of those services' public card, the extra shows as a checkbox with the right price and time. Delete it after.

---

## E. Duplicate (p13)

Today Duplicate creates the copy and jumps straight into the normal editor. The PDF shows a review screen first:
- Title "Volumen ruso 4D (copy)", subtitle "Draft · copied from Volumen ruso 4D a moment ago". Header actions: "Discard the copy" (text button, deletes the copy with `deleteTalentOfferingForever`), "Save draft", "Publish service".
- Info banner: "This is a new draft. Nobody can see it and it is not yet in your catalogue as a second live item. Rename it before you publish, or your clients will see two services with the same name."
- Card "What came across": rows Name (marked as a copy until you rename it), Photos (N photos, the same files, still tagged to both services), Price and length (copied, change them freely), Booking rules (Instant · 25% deposit · 24 h, copied).
- Card "What stayed with the original": ✕ N bookings, ✕ N reviews, ✕ Its sales history, ✕ Its public link. Footer: "A copy is a new thing. It starts with no history of its own, which is what makes it safe to experiment with." Use real counts if you can query them cheaply (bookings, reviews for the offering). If not, show the words without numbers. Never invent numbers.
- Right: "YOUR CATALOGUE AFTER PUBLISHING" with the two rows (original and copy highlighted) and "Two separate rows. The original keeps its bookings and its link; the copy is a draft until you publish it."
- Also: a product copy must never inherit stock (`duplicateTalentOffering` already nulls `inventoryQty`; keep that).
- Code: `onDuplicate` in `ServicesHome.tsx`; add a `DuplicateReviewScreen` component file.

---

## F. Hide an item (p14)

The hide dialog exists in `ServicesHome.tsx`. Match p14 exactly:
- Page subtitle while the dialog is open: `Hiding "Cambio de esmalte tradicional"`.
- Dialog "Hide this from your pages?" with three rows and icons: "!" row "It comes off your Tulala profile and Riviera Maya Work" (build the names from `loadOfferingDestinations`) + "Within a few minutes. Nobody can book it after that."; "✓ Bookings already made are untouched" + "Their price, their deposit and their conversation all stay as agreed."; "✓ You can put it back at any time" + "It returns with the same content and the same link." Buttons Cancel / "Hide it".
- The row afterwards: "Hidden" chip, "Off every public page. Your two bookings for it still stand." (real booking count if available), "Show again" button.
- After Show again: "Live" chip, "Back on both pages with the same link, so nothing you shared is broken.", "Hide" button.
- Failure state: red "Could not hide it" chip, "It is still public and nothing was lost. Try again, or we will chase the hub.", "Try again".

---

## G. Publishing flow (p08, p09, p10) and Preview (p11)

- p08: while publishing, the primary button reads "Publishing…" and is disabled, every field stays on screen. On failure the fields stay and a Retry appears. This is built in `EditorScreen.tsx`; prove it (force an error once, e.g. offline) and screenshot.
- p09/p10: the published banner (`PublishedBanner.tsx`) was rebuilt: title in quotes + "is live", where it can be booked, View as customer / Share / Add another. Check `onAddAnother` is passed from `ServicesHome` (it was added; the other agent's uncommitted edits may have touched it). Compare against p09 and p10.
- p11: the Preview dialog in `EditorScreen.tsx`. Compare with p11 and match.

---

## H. Website reward (p17 to p21)

Files: `web/src/components/talent/website-reward/WebsiteRewardControl.tsx`, `web/src/lib/talent/website-reward.ts`.
- Done: pill states per p18, the sheet (p19) listing missing items with deep links into the profile drawer and field focus.
- Missing: p17 (the reward card on the phone Services screen, full width, above the list; it scrolls away and never shows while editing an item). p20 ("the task it opens": "Tulala drafted this / Keep it / Write my own" for the short bio). p21 ("back, with progress": confirmation like "Intro saved" and the bar moving without a full reload).
- Sheet deviations to fix if you can: it only shows missing items, not done ones with ticks and "3 of 6". The completion bridge only sends `missing`; see if the full checklist is available from `buildTalentChecklist` in `web/src/lib/talent-dashboard.ts`.
- Locally the live pill shows `/t/TAL-JORGBEAUTY` instead of her host because the subdomain flag is Production-only. That is correct behaviour; don't "fix" it.

---

## I. Categories (p31, p32, p34, p35)

- p33/p35 done in `OrganizeScreen.tsx`. p31/p32 (making a new category) are NOT built: in the editor's Category field, offer her existing categories, allow "+ New category", and warn on a near match while typing (for example "unas" vs "Uñas", accent and case folding with `foldAccent` from `web/src/lib/talent/publication-state.ts`).
- p34 is the phone version of Organize: rows end in a chevron that opens rename. Verify at 390px.
- Category order: `saveCategoryOrder` stores `category_order`, but the public surfaces don't read it. The Organize screen even says "Category order is not saved yet". Make the hub storefront (`web/src/app/t/[profileCode]/_shared/TalentStorefront.tsx`) and the `services_catalog` widget sort categories by the saved order, then remove that warning text.
- Rename persistence: prove a rename on localhost updates all items, then rename it back.

---

## J. Every action and item states (p36, p37)

- p37 is the reference table of every action and every item state. Go through each action on a real row: Edit, Preview as customer, Share (copies the right public link), Duplicate, Hide, Show again, Archive, Restore, Delete forever (only from Archived, with a confirmation), Move up, Move down. Each must do exactly what the table says, and only appear on rows where it applies (for example no "Show again" on a live row).
- `ItemStateChips.tsx`: Draft / Live / Hidden / Archived / Sold out / Needs a photo etc. Compare wording and colors with p37.

---

## K. Three public surfaces must agree (p38)

The same item must show the same name, price, duration, photo and CTA on:
1. The hub profile storefront `/t/TAL-JORGBEAUTY`
2. Her Max site via the `services_catalog` widget
3. The directory card

Check all three on localhost for 3 items (one service, one package, one with a quote price). Fix any mismatch. The shared card is `web/src/components/talent/offering-card/OfferingCard.tsx`.

---

## L. Phone layouts

Check every phone frame at 390×844 and 360×844: p04 (Services home), p07 (editor), p17 (reward card), p24 (product), p29 (camera add), p34 (organize). The bottom nav is Today / Messages / Calendar / Money / More. The big green "+ Add item" button sits above the nav on the Services home.

---

## M. Smaller deviations left by the first build

- `DefaultsScreen.tsx`: "MXN" is hardcoded in the travel fee and the worked example; pass the talent's currency. The "time before / time after" travel fields from the PDF are missing because `SellingDefaults` has no field for them; add them if the PDF needs them (check p15). Buffer and minimum notice are saved but not written into `booking_hours`, so they don't affect real availability yet. Wire that or report it clearly.
- The home-visit value is `"client"` in both Defaults and the editor (was `client_place` once; keep `"client"`).
- `AddManyScreen.tsx`: the "+" photo slots in the table are decoration only; make them open the portfolio picker. "Duration guessed" never shows because the parser doesn't guess.
- `CameraAddScreen.tsx`: only step 1 of 3 is built. Build steps 2 and 3 if the PDF (p29) implies them, otherwise remove "1 of 3".
- `ClientsPage.tsx`: the first build warned that `talent_bookings` column names may not match. Open the Clients page with Jor's data and check there are no errors in the server log.
- Editor: "last saved today 09:41" line from p12 is replaced by "Live · changes apply to new bookings only" because there is no updated_at on the item type. Add it if `updated_at` is available.
- Editor client card: the PDF shows "Jor Beauty · Cancún" under the title. Pass the talent's display name and city if available.

---

## N. Spanish and the full walkthrough

- Switch the dashboard to Spanish and walk every screen above. No English left, no raw keys, no em dashes.
- Include every string the presence work added.

---

## O. Schema

- Migration `supabase/migrations/20261231284000_services_rebuild.sql` was applied remotely through the Management API (not `db:push`). Run `cd web && npm run db:check` and confirm it is recorded. A green `db:check` does not prove the objects exist: also check the new columns and tables exist (for example `first_published_at`, `category_order`, `selling_defaults`, `talent_addon_groups`).
- Any new column you add (for example for extras photos) needs its own migration with a timestamp after the newest file, applied before merge.

---

## P. Separate bug found on the live site (investigate, don't guess-fix)

On `book-jorgelina.tulala.digital`, a guest can now send a message (fixed in PR #2226, D-MSG-422, verified live). But in the chat, "Guarda esta conversación" → "Envíame un enlace de acceso" fails for a brand-new gmail address with `forbidden: "That email is already tied to a team account — try a personal email instead."` Find the server action behind that button, find why a fresh email matches a team account (it may be reading the session's user instead of the typed email), and fix it in its own branch off `origin/main`, not in this worktree. Test with a clean browser profile, since the httpOnly guest cookie survives JS cookie clearing. Also check which origin the access link points to (platform vs the vanity host); a link to a reserved path on the vanity host would 404.

---

## Q. Finish

1. Put screenshots of every page next to its PDF page in `docs/plans/services-rebuild/evidence/pNN-*.png`.
2. Update `REPORT.md` and `EXECUTION-PLAN.md`: what matches, what deviates and why, what is not done (re-check each "not done" line against the code, don't copy it from this file).
3. Rebase `feat/services-rebuild` onto the latest `origin/main`. Run typecheck, lint and the test lanes you touched (`npm run test:builder-node-bindings`, `npm run test:billing` for the talent tests).
4. Open PRs only when the owner asks. Never merge. Never touch the `production` branch.

Report format when you stop: done (with screenshot paths), not done (with the reason), and anything that needs an owner decision (the live band swap in B3 is one).
