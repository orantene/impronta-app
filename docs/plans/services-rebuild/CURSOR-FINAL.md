# Cursor final prompt: Services rebuild done, proven, and live on Jor's website

You are finishing the Services rebuild for the talent dashboard, with Jor Beauty (Jorgelina) as the demo account. The goal is simple: Jor can manage everything she sells exactly as the designer PDF shows, and a real client can book her from her real website, book-jorgelina.tulala.digital.

This prompt has 4 parts and 26 steps. Parts 1 to 3 happen on localhost. Part 4 happens on the live site and **only starts when the owner writes "GO LIVE"** in this chat. Until then, finishing Part 3 is the finish line.

Previous rounds are in `docs/plans/services-rebuild/CURSOR-HANDOFF.md` and `CURSOR-MARATHON.md` (file paths, data shapes, what's already built). Where they disagree with this file, this file wins.

---

## Rules (read before anything)

**Where**
- Worktree `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/services-rebuild`, branch `feat/services-rebuild`.
- Spec: the PDF pages at `/Users/oranpersonal/Desktop/impronta-app/docs/plans/services-rebuild/pages/p01.png` to `p38.png`.
- Dev server: the `services-rebuild` entry in `.claude/launch.json`, port **3000** only. Register the lease: `bash ~/.claude/tulala-dev-lease.sh grant <abs web dir> "services rebuild"`. Revoke it at the end.

**Jor's live website is sacred**
- Localhost uses the real production database. Jor's home page row (`talent_pages` id `bad420b5-13cc-45ab-a915-841e775b1a7c`) IS her live website. There is no separate draft. Editing it on localhost edits the live site immediately.
- In Parts 1 to 3, **never open, edit, save or publish Jor's real pages or her `talent_sites` row.** Test the widget on a scratch page you create and delete, or on `/dev/jor-beauty`.
- Her page fingerprint must stay `f8156c9405` until Part 4. Compute it like this (Python): `hashlib.sha1(json.dumps(blocks, sort_keys=True).encode()).hexdigest()[:10]`. Check it at the start, before Part 4, and at the end.
- The known-good copy of her page is `talent_page_revisions` id `79ef2414-e567-4a35-ae2f-62f5cd1305a5`. That's the rollback point.
- In round 1 an agent put the widget into her real page, then "undid" it with the wrong revision, and her live menu was empty for an hour. Don't repeat that.

**Other writes to Jor**
- Allowed: test items, test extras, test products, test bookings, a test availability window, a test category rename. Each is created, proven, then removed.
- Log every write in `REPORT.md` with the exact undo.

**Checks and code**
- Only `cd web && npm run typecheck` (queued) and `npm run lint`. Never bare `tsc`, `npx tsc` or `eslint`. Check real exit codes: `npm run x > out 2>&1; echo $?`.
- Every new string in English and Spanish, Spanish in `ES_TEXT` in `web/src/components/admin/shell/internal/dashboard-i18n.ts`, no duplicate keys, no em dashes.
- Don't revert: `ServicesHome` `onSave` calls `upsertTalentOffering` directly (the old `editor.saveDraft` never saved new items). The home-visit value is `"client"`.
- One commit per step with its screenshot in `docs/plans/services-rebuild/evidence/`.

**Localhost gotchas that are not bugs**
- After a server restart, pages can 404 or hang for about 60 seconds (host cache). Wait, then reload.
- Tailwind values like `max-w-[660px]` added after the server started may not compile. Use an inline `style`, or restart.
- If Jor's session expires, use `IMPERSONATION_QA_TALENT_USER_ID` from `.env.local`. Never type a password.

**When something fails**
- "It didn't load" or "no slots came back" is a finding to diagnose, not a reason to stop. Check the server log, restart the server, delete `web/.next`, and check your own recent code. Only after two honest attempts, write the real reason in `REPORT.md` and move on. Never report a pass you didn't see.

---

## Part 1: Jor manages her services (localhost)

1. Jor opens her Services page. All 22 services with photos, prices in MXN with the ≈US$ line, filter chips and counts, matching p03/p04.
2. She adds a new service (name, photo, price, length) and publishes it. She sees "Publishing…" (disabled, all fields kept), then the published banner (title in quotes + "is live", where it can be booked, View as customer, Share, Add another). Force one failure first and show Retry keeping every field (p08 to p10). Also check Preview against p11.
3. She edits it, hides it (dialog copy per p14, then a "Hidden" row), shows it again ("Live" row), and forces one hide failure ("Could not hide it" + Try again).
4. She duplicates it and sees the review screen (p13), then "Discard the copy" deletes the copy.
5. She creates an extra, "Encapsulado con glitter", +200 MXN, +25 min, one photo, on the New extra screen (p25), and attaches it to two nail services.
6. She adds a product with sizes S/M/L, stock 7, "Pick up at the studio" (p23/p24). "Ship it" stays locked until checkout charges shipping.
7. She renames a category and renames it back, and every item follows. Typing "unas" in the editor warns that "Uñas" already exists (p31/p32). Categories follow her saved order on her profile and in the widget.
8. She sets a 10-minute buffer and a minimum notice in Defaults (p15). **These must change the open booking times.** Wire them into the slot calculation, show a before/after, and remove the "doesn't affect slots yet" label.
9. Every row action works on a test item and shows only where it applies (p37): Edit, Preview, Share, Duplicate, Hide, Show again, Archive, Restore, Delete forever, Move up, Move down. The state chips match p37.
10. Steps 1 to 9 also work at 390×844 and 360×844 (p04, p07, p17, p24, p29, p34), and in Spanish.

## Part 2: A client books her (localhost, scratch page)

11. On the scratch page, the Services menu widget looks like her live menu, side by side with book-jorgelina.tulala.digital/#servicios: "EL MENÚ", "Servicios *y precios*", subtitle, "22 SERVICIOS · 4 CATEGORÍAS", tabs that filter, photo rows, "Seleccionar". The Uñas tab shows "Todos los servicios de uñas incluyen manicura rusa de cortesía."
12. The client picks a nail service and ticks the glitter extra, and the total goes up by 200 MXN. A service without extras goes straight to the time step. A consult/quote service ends as "pending", not booked.
13. The client sees **real open times** from Jor's schedule, and the 10-minute buffer is respected. If no times come back, find out why: check her working hours in whatever table the slots API reads. If she has none, add a test availability window (logged, with undo).
14. The client picks a time, enters a name and email, and confirms. **The booking really exists**: show the database row and show it in Jor's dashboard.
15. The same flow works at 390px and in Spanish.

## Part 3: Clean up and prove nothing broke (localhost)

16. Delete every test item, extra, product, booking, availability window and the scratch page. Undo the category rename. Show each is gone.
17. Jor's live site still shows her original menu with all 22 services, and her page fingerprint is still `f8156c9405`.
18. Typecheck, lint, `npm run test:builder-node-bindings` and `npm run test:billing` pass. If a failure also happens on a clean `origin/main`, show that and name the main commit. Everything is committed and the tree is clean. Nothing pushed, merged or published.

**Stop here and report** (format at the bottom). Part 4 starts only when the owner writes "GO LIVE".

---

## Part 4: Jor's real website works (only after "GO LIVE")

**Ship the code**

19. Rebase `feat/services-rebuild` onto the latest `origin/main` (on a `package.json` test-lane conflict, keep main's line and re-add only your files). Run `cd web && npm run db:check`, and confirm for real that every column and table the branch uses exists remotely (for example `first_published_at`, `category_order`, `selling_defaults`, `talent_addon_groups`). Any unapplied migration: `npm run db:push` **before** the merge. Typecheck and lint green. Push the branch, open a PR to `main`, and wait for CI to be green **and** the PR to be mergeable (not conflicting). Merge. Wait for the `production` pointer to advance automatically. Never push it by hand. Prove the fix is live: the production deployment's commit contains your merge, and `cd web && npm run deploy:smoke` exits 0. Paste both.

**Swap her menu**

20. Save the undo point: record her home page fingerprint (must be `f8156c9405`) and the revision id you'd restore (`79ef2414-e567-4a35-ae2f-62f5cd1305a5`).
21. On her real home page, replace only the old `#servicios` menu band with the Services menu widget. Nothing else on the page changes. Rules for the swap:
    - The widget keeps the anchor id `servicios`, so the header link "Servicios" and the "Ver servicios y reservar" button still scroll to it.
    - Same eyebrow, title (with the italic part), subtitle and Uñas note as the old band. Spanish button "Seleccionar".
    - The header "Reservar" button currently links off her site to `tulala.digital/t/TAL-JORGBEAUTY#servicios`. Change it to `#servicios` so clients stay on her site.
    - Save and publish through the product's own site editor, the way Jor would.

**Prove it live**

22. Open book-jorgelina.tulala.digital/#servicios on desktop and on a phone. It looks like her menu does today: title, "22 SERVICIOS · 4 CATEGORÍAS", tabs, photos, prices, "Seleccionar". All 22 services are there. Every tab works. The header links scroll to it.
23. A real client flow on the live site: click "Seleccionar" on a nail service, add the glitter extra (if it still exists, otherwise any extra; the total goes up), see Jor's real open times, pick one, enter a name and email, confirm. **It's a real booking**, and it shows up in Jor's dashboard.
    - **No real money.** Use a service that is pay-in-person or has no deposit. If every path needs a card, stop and ask the owner. Never enter a real card.
    - Use an obviously fake name: "QA Test - please ignore".
    - Tell the owner before this step, because Jor may get a notification.
24. Cancel and delete that test booking right away. Log it with its undo. Show it's gone from her dashboard.
25. The same live flow works in Spanish and on a phone.
26. If anything is wrong at any point in Part 4, restore her page to the saved undo point immediately (copy revision `79ef2414...` blocks back onto the page), check live that the original menu is back, and report. If the deploy itself breaks something, open a revert PR. Never force-push or move `production` by hand.

**Done = all 26 steps happened, each with a screenshot, listed in `REPORT.md`.**

---

## Report format when you stop

1. **Done:** each step number with its screenshot path.
2. **Not done:** each step number with the real reason and what you tried.
3. **Every write to Jor's data**, with its undo and whether it was undone.
4. **Her page fingerprint** at the start, before Part 4, and at the end.
5. **Links:** PR, CI run, production deployment (Part 4 only).
6. **Anything that needs the owner.**
