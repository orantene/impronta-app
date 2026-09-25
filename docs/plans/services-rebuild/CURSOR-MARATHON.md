# Cursor marathon: finish and prove the Services rebuild (round 2)

You did good work in round 1: the booking sheet on the Services menu widget, the product draft, the duplicate review, the hide dialog, Organize, the intro task, "Intro saved", the row menu. This round finishes and proves everything else. Work straight through the list in order. Don't stop to ask unless a rule below says "stop and report".

Read `CURSOR-HANDOFF.md` (round 1) for file paths and data shapes. This file wins wherever the two disagree.

---

## 0. Read first: what went wrong in round 1

**Jor's live site was broken by the round-1 run, and has been repaired.** The widget was inserted into her REAL home page (`talent_pages` id `bad420b5-13cc-45ab-a915-841e775b1a7c`), and that page was republished at 17:20 UTC. To remove the widget, the run restored revision `067e2700` (17:17), a stripped copy. For about an hour, book-jorgelina.tulala.digital/#servicios showed only "EL MENÚ" and four tabs: no title, no counts, no services, no Seleccionar. The round-1 report said the site "was not published". That was false.

It was restored from revision `79ef2414` (blocks hash `f8156c9405`) and checked live: all 22 services are back.

Why it happened: localhost reads and writes the shared production database. For a talent Max site, the `talent_pages` row IS the live page. There is no separate draft. Editing her page in the builder on localhost edits her real website.

**New hard rules, with no exceptions:**
1. **Never open, edit, save or publish Jor's real pages** (`talent_pages` for profile `f048e578-cbae-45db-9a3b-34239abea136`) or her `talent_sites` row. To test the widget, create a scratch page (next section) and delete it at the end.
2. Before you write "not published" or "untouched" in any report, prove it. Read her home page's `updated_at` and `published_at`, and hash its `blocks` against `f8156c9405`. If the hash differs, say so, stop and report.
3. Every write to Jor's data goes in `REPORT.md` with the exact undo.
4. Talent-side writes allowed on Jor: test items, test extras, test bookings. Each is created, proven, then deleted. Nothing else.

**A scratch page for widget tests.** Create a separate, unpublished page for her (slug `qa-widget-scratch`, not home, not in the nav). Or render the widget through the existing `/dev/jor-beauty` route if it already renders from real data. Log the page id and delete it at the end. If a scratch page can't render without being published, use `/dev/jor-beauty` only, and say so.

---

## 1. Environment rules (same as round 1, plus what cost time)

- Worktree `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/services-rebuild`, branch `feat/services-rebuild`. Never commit to `main`, never merge, never push or move `production`, never open a PR.
- Dev server: the `services-rebuild` entry in `.claude/launch.json`, port 3000 only. Register the lease: `bash ~/.claude/tulala-dev-lease.sh grant <abs web dir> "services rebuild"`. Revoke it at the end.
- After a server restart, pages can 404 for about 60 seconds (host cache). Wait, then reload. Don't "fix" the proxy.
- Tailwind values like `max-w-[660px]` added after the server started may not compile. Use an inline `style`, or restart.
- If Jor's session expires, use `IMPERSONATION_QA_TALENT_USER_ID` from `.env.local`. Never type a password.
- Checks: `cd web && npm run typecheck` (queued) and `npm run lint`. **Never run bare `tsc`, `npx tsc` or `eslint`.** Check real exit codes: `npm run x > out 2>&1; echo $?`.
- Every new string in English and Spanish, Spanish in `ES_TEXT` in `dashboard-i18n.ts`, no duplicate keys, no em dashes.
- Do not revert: `ServicesHome` `onSave` calls `upsertTalentOffering` directly. `editor.saveDraft` returned null for new items and saved nothing.
- The home-visit value is `"client"` in Defaults and the editor. Keep it.

---

## 2. Order of work

One commit per item, each with its screenshot in `docs/plans/services-rebuild/evidence/`. If an item can't be proven in two honest tries, write why in `REPORT.md` and move to the next. Never stall and never fake a pass.

### Step A. Make the work safe (first, before anything else)

1. **Commit everything now.** 26 files are uncommitted, including the widget booking sheet, its tests and the screenshots. The stash is shared with other agents; uncommitted work can be lost. Separate commits: booking sheet + island, tests, evidence, report edits.
2. **Fix the branch's upstream.** It tracks `origin/feat/talent-mxn-usd-equivalent`, which is merged and stale. Run `git branch --set-upstream-to=origin/main`. Don't push.
3. **The branch is NOT on the latest `origin/main`.** `git merge-base --is-ancestor origin/main HEAD` is false. Rebase onto `origin/main` now, before more work, not at the end. On a `package.json` test-lane conflict, keep main's line and re-add only your files. Then run typecheck and lint.
4. **Test lanes.** Run `npm run test:builder-node-bindings` (not run since the sheet). Run `npm run test:billing` and look at the zero-price "Fade" failure. Run the same lane on a clean `origin/main` worktree. If it also fails on main, note it as pre-existing, with the main SHA. If it only fails here, it's yours: fix it.
5. **Rewrite `REPORT.md` and `EXECUTION-PLAN.md` from the code and the evidence folder.** They still say the widget was never proven. Also add the live-site incident above, honestly.

Pass: clean `git status`, on top of `origin/main`, typecheck, lint and both lanes green (or the pre-existing failure proven on main).

### Step B. Finish the widget booking flow on the scratch page

On a localhost render of the scratch page (or `/dev/jor-beauty`), not in the editor:
1. Select a service **with** extras: extras raise the total, Continue stays off until a time is picked, then guest name and email, then a confirmation. **Confirm the slots come from the real slots API** (network tab) and that confirming calls `createInstantBookingAction` (or the talent's confirm-by-hand path). Read the created booking in the DB, screenshot it, then **delete that test booking** and log it with its undo.
2. Select a service **without** extras: it goes straight to the time step. Screenshot.
3. A **consult / quote** service ends as **pending**, not booked. Screenshot.
4. **Pass the category note to the sheet.** Her live menu shows "Todos los servicios de uñas incluyen manicura rusa de cortesía" under Uñas. Pass that inclusion line through the rows so the sheet shows it. Say where the text comes from: a category field, or `attributes`.
5. The same flow **in Spanish** and **at 390px**. Screenshot every step.
6. Match her current live band (compare side by side with book-jorgelina.tulala.digital/#servicios): "EL MENÚ" eyebrow, the "Servicios *y precios*" title with the italic part, subtitle, big "22 SERVICIOS / 4 CATEGORÍAS" counts, dark filled active tab, ~120px photo rows with hairline dividers, "2 h · duración estimada", "$700", outline "Seleccionar". Screenshot yours next to hers.
7. **Stop there.** Swapping her live band for the widget is the owner's call. Leave `evidence/p-widget-vs-live.png` for the owner.

### Step C. The screens still not proven

For each: build what's missing, prove it on localhost against the PDF page, screenshot, commit.

1. **Extras (p25).** Create an extra ("Encapsulado con glitter", +200 MXN, +25 min, one photo). Attach it to two nail services. Open one of those services in the widget flow on the scratch page and show the extra as a checkbox with the right price and time. Delete the extra, and log it.
2. **Hide (p14).** Actually hide a test item (create one, never hide her real items): the Hidden row with "Off every public page...", then Show again with the Live row, then force a failure (for example block the request) and show the "Could not hide it" row with Try again. Delete the test item.
3. **Publishing (p08–p10).** On a test item: "Publishing…" disabled, a forced failure with Retry and all fields kept, then a real publish and the Published banner (title in quotes + "is live", where it can be booked, View as customer, Share, Add another opens the type dialog). Delete the item.
4. **Preview (p11).** Compare with the PDF and screenshot.
5. **Categories (p31, p32).** Typing "Unas" did not show the near-match warning. **That's a bug: fix it.** Fold accents and case with `foldAccent`, and warn that "Uñas" already exists. Also add "+ New category". Then rename one of her categories on localhost, confirm every item followed, and rename it back. Log both writes.
6. **Category order.** Make the hub storefront and the widget sort by the saved `category_order`. Remove the "Category order is not saved yet" line from Organize.
7. **Every action (p37).** On a test item, run every row action: Edit, Preview, Share (check the copied link), Duplicate, Hide, Show again, Archive, Restore, Delete forever (only from Archived, with confirmation), Move up, Move down. Each must appear only where it applies. Chips in `ItemStateChips.tsx` must match the p37 table.
8. **Three surfaces agree (p38).** The same service, package and quote item must show the same name, price, duration, photo and CTA on the hub profile (`/t/TAL-JORGBEAUTY` on localhost), the widget (scratch page) and the directory card. Fix every mismatch.
9. **Phones.** Check 390×844 and 360×844 for p04, p07, p17 (the reward card is committed but has no screenshot), p24, p29 and p34.

### Step D. Smaller deviations (M)

1. Defaults: use the talent's currency instead of hardcoded "MXN". Add travel before/after if p15 shows them.
2. Buffer and minimum notice: wire them into real availability (`booking_hours` or wherever slots are computed). If that is too big, write clearly in the Defaults screen copy and in the report that they don't affect bookings yet.
3. Add many: the "+" photo slots open the portfolio picker.
4. Camera add: build steps 2 and 3 from p29, or remove "1 of 3".
5. Clients page: open it with Jor's data and confirm the server log shows no errors.
6. Editor card: "Jor Beauty · Cancún" under the title (display name + city), and "last saved …" if `updated_at` is available.

### Step E. Shipping on products (money)

The checkout ignores `attributes.fulfillment`. A talent could publish a product with "Ship it · 120 MXN" and the fee would never be charged. **Don't leave that live-able.** Until checkout charges it, show the Ship card as "Coming soon", or block publishing a product with Ship turned on, with a plain sentence explaining why. Pickup and "at their appointment" stay available. Write it in the report as a known gap.

### Step F. Spanish walkthrough

Switch to Spanish and walk every screen touched in B–E, including the presence strings. No English, no raw keys, no em dashes. Screenshot each.

### Step G. Schema

`cd web && npm run db:check`, plus a real check that `first_published_at`, `category_order`, `selling_defaults` and `talent_addon_groups` exist remotely. Any new column gets a migration timestamped after the newest file, applied before any merge.

### Step H. Finish

1. Delete the scratch page and every test item, extra and booking. Prove Jor's home page hash is still `f8156c9405`.
2. Rewrite `REPORT.md`: done (with evidence paths), not done (with the reason, re-checked against the code), every write to Jor with its undo, and owner decisions pending.
3. Typecheck, lint, `test:builder-node-bindings`, `test:billing`: all green, or pre-existing failures proven on main.
4. Revoke the dev-server lease.

---

## Not yours this round (don't touch)

- Swapping her live #servicios band for the widget (owner decision; leave the before/after).
- Opening a PR, merging, the production branch.
- The guest "Envíame un enlace de acceso" team-account error. That goes on its own branch off `origin/main`, later.

## When you stop, report in this shape

1. Done, each with its evidence file.
2. Not done, each with the reason.
3. Every write to Jor's data and its undo.
4. Jor's home page hash at the end (must be `f8156c9405`).
5. Owner decisions waiting.
