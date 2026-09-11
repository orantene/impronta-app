# pos-projects: the Collect mode of the point of sale, 2026-09-10

Branch `work/pos-projects` off `program/journeys-2026-09` at `76d695a5d`, with
the program branch merged in twice before the finish (`bb482b585`-era Tables,
Door and the enable control at the start; `2fce7e2c8` Front desk at the end).
Mode id `projects` (D-POS-10; a stored `client` or `work` is read as an alias,
neither is accepted from a URL). Switch label **Collect** (es "Cobrar", fr
"Encaisser"), reached from the top bar switch "Workspace | <mode>" and its menu,
at `/admin/pos?mode=projects`. Database: Supabase branch `fxlankepwnvelxjrahwk`
(qa-journeys). Production was never read from or written to; `npm run db:push`
was never run; no migration was added.

## Where it was proven, honestly

**Not on the deployed QA host.** The branch is not pushed (the brief says do not
push), so `staging-qa-journeys.tulala.digital` cannot carry this commit. The
journey ran on a **local dev server of THIS worktree against the SAME QA
database**, the way `pos-door`, `pos-floor` and `pos-classes` did:

- `next dev` on `:3150` with `.env.capacity-isolated.local` exported,
  `TULALA_ALLOW_DEV_SURFACES=1` and a `GUEST_COOKIE_SECRET` generated for the
  run, behind `scripts/local-host-proxy.mjs 3151 qa-journeys.local 3150`, so the
  app sees the registered tenant host and the browser stays on
  `http://localhost:3151`. Dev-server lease granted for the run and revoked
  after it.
- `PLAYWRIGHT_BASE_URL=http://localhost:3151 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/cases/POS-projects-collect-a-balance.spec.ts --project=chromium --workers=1 --reporter=line --trace=on`
  (run 20 additionally with `POS_PROJECTS_FRESH_SEED=1`, which refuses to reuse
  a project a previous run left owing money and walks the whole chain again).
- Same real browser, same fixture sign-in (`/api/dev/signin`), same rows. The
  only thing that differs from the deployed host is which build answers.

**Passing runs.** Run 19 (`run19-pass/`, 1 passed in 1.3 min, on the project
run 14 had made), run 20 (`run20-pass/`, 1 passed in 3.7 min, a fresh
conversation from the storefront to a collected deposit) and run 21
(`run21-pass/`, 1 passed in 1.3 min, after the client was split for the line
budget and the loader's read-back fix), all 2026-09-10 between 21:50Z and
22:12Z. The Playwright traces record the session cookies of
four accounts, so they are NOT committed; they are beside the worktree at
`scratchpad/pos-projects-traces-uncommitted/`.

## What was resumed, and what was wrong

The killed run left nine uncommitted files: the mode's seven modules under
`admin/pos/_projects/` (page, loader, actions, pure model + its 17 tests, copy,
client), the branch in `pos/page.tsx`, the rail in `modes.ts`, ~100 catalogue
keys in three languages, the journey spec, and two scratch scripts. None of it
had been run: not the dev server, not the spec, not a typecheck. Kept whole:
the design of all of it (the reader's money, the stricter gate, the counter's
own `CollectSheet` and engine). Found and corrected:

1. **The seed could not be walked.** The spec approved "the newest sent offer",
   which on this fixture belongs to an operator-made inquiry (`c08-op-*`) whose
   client never claimed an account; a client account with no
   `agency_client_relationships` row cannot open the client surface ("No client
   account here"), and an onboarded client with no relationship has no path in
   at all (`/client` sends them to the marketing home). The seed now makes a
   NEW conversation through the interface end to end (below) and no longer
   depends on what earlier proofs left behind.
2. **The talent inbox fallback clicked the first "Cora Cuevas" row**, a
   stage-1 inquiry with no offer, because the check for the deep link's button
   was instantaneous and the fixture has many rows for that name. The deep link
   is now given a real wait and the fallback filters to rows at the Offer stage.
3. **The merge with the program branch (done at the start, before the spec was
   ever run) cut the Tables branch of `pos/page.tsx` mid-JSX**: a build error
   overlay on every `/admin/pos` request (run 13). Repaired; every mode's branch
   is present (`classes`, `door`, `floor`, `projects`, then the counter).
4. **The public receipt was asserted to show the deposit.** `/r/<code>` is the
   ORDER's receipt: what was bought, the order's total, "Your tickets". It says
   nothing about a partial payment or what is still owed (finding below). The
   spec now asserts the order's total there; the collected figure is read on
   the mode's own Receipts screen.
5. **Two casts** (`id as ProjectsModeView`) in the rail handler are a type
   guard now. The two scratch scripts (`scripts/.pp-*`) are deleted; the SQL
   helper lives here as `sql/read-rows.mjs`.
6. **Labels.** The decision on the switch label arrived after the predecessor
   branched: `dashboard.pos.counter.mode.projects`, the mode's title and rail
   label, the settings card's label and description, and `POS_MODE_META.projects.label`
   now read Collect / Cobrar / Encaisser. `enabledPosModesFromSettings` reads a
   stored `client` or `work` as `projects` (`modes.test.ts`, proven red with one
   alias removed); `parsePosMode` still refuses them from a URL.
7. `projects-mode-model.test.ts` was not enrolled in any lane; it is in
   `test:money` beside `counter-model.test.ts`.

## The screens, and what a person clicks

- **Settings › Point of sale**: the Collect switch (`00`). The spec switches on
  Collect AND the counter, because this fixture's settings are shared with
  every other proof and the counter is where the drawer the cash lands in is
  opened.
- **The top bar switch** "Workspace | Collect" → menu → Collect lands on
  `/admin/pos?mode=projects` with no workspace sidebar and the mode's own rail:
  Collect · Projects · Receipts (`01`).
- **Collect** (the rail's first row, the landing): type a client's or project's
  name; the list narrows, money owed first; each row carries Owed by the desk's
  rule and the one next action; Open (`02`).
- **A project, money first** (`03`): Still owed by the client · Collected ·
  Agreed with the client, then "Where the figure comes from": every attached
  record with status, total, collected, outstanding and its receipt code, a
  cancelled record marked "Not counted: this record is not awaiting payment".
  The one next action, "Collect the balance", is the primary button
  "Collect $800.00" (56 px).
- **Collect a balance** (`04`): The whole balance or A deposit (typed in major
  units, refused in a sentence when not a number, zero, or over the balance);
  the counter's own `CollectSheet` with Cash · Card · Payment link · Pass credit
  (the three unavailable ones say why, the counter's sentences); the contact
  fields; "A collection here goes against record <id>".
- **Collected** (`05`): amount, change, still owed after this, the receipt link
  (minted at the first collection if the order was born without one) and Copy;
  Back to the project.
- **Balance after** (`06`): the same screen re-read through the reader after
  `router.refresh()`.
- **Receipts** (rail): a receipt by its public code, inside this workspace;
  record, status, total, collected, Open the receipt (`08`); an unknown code
  refused in a sentence (`08b`); the public page itself (`09`).
- **Projects** (rail): every project with its one next action (`10`); Open →
  the same record with milestones and deliverables (`11`).
- **Refused Collect** (`12`): with a version of the agreement waiting on the
  client, the Collect button is gone and the panel says why.

## What was proven, figure by figure (run 20 unless noted)

Rows are in `sql/*.run20.out.json` (and `.run19.` for run 19), read with
`sql/read-rows.mjs`, which refuses a production URL.

1. **The seed, through the interface.** A guest asks the agency from the
   storefront (`/directory?inquiry=open`, "Nadia Varela",
   `pos-projects-<ts>@impronta.test`); staff open classic Messages, filter by
   the name, put QA Journeys Talent on the lineup, price a line at 800, Save
   draft, Send to client; the talent approves it from their inbox (the approval
   row is what is waited on); the client signs in, picks "I'm a client" on
   `/onboarding/role` (records the workspace relationship), and sees the offer
   accepted; staff press Create booking on the conversation, which mints the
   $800.00 order (`bookings_write_order`). One account and one status are
   provisioned outside the interface and named in the annotations: the client's
   auth account (a guest has none until they open a claim email, and there is no
   mailbox here) and `profiles.account_status` (defect 1 below).
2. **A project with a real balance.** Row: order `e1b50d38…` `pending_payment`,
   total 80,000, collected 0 → owed 80,000 by the desk's rule. Screen: the row
   under the client's name reads $800.00; the record reads Still owed $800.00,
   Collected $0.00, Agreed $800.00, one record row, Collect $800.00 (`02`, `03`).
3. **A cash deposit through the till.** $300.00 typed as a deposit; the sheet's
   Amount due is $300.00, not the balance (`04`); Confirm cash. Row: one PAID
   `booking_transactions` `e3cdab90…`, `gross_amount_cents` 30000, provider
   `manual`, `metadata.paid_via = cash`, stamped with the open drawer
   `ad377f08…` (a sibling proof's shift; the money lands in whichever drawer is
   open, as the counter's does). Screen: Collected $300.00, Change $0.00, Still
   owed after this $500.00, receipt `dhacukae8betbi6q28i7` (`05`).
4. **The balance after, read back.** Row: total 80,000, collected 30,000,
   status still `pending_payment` (a deposit does not settle the order) → owed
   50,000. Screen after reload: $500.00 owed, $300.00 collected, "Collect
   $500.00" (`06`). Run 19 read the same project after three earlier deposits:
   737.50 collected, $62.50 owed, four PAID rows summing to 73,750
   (`sql/02-collection-rows.run19.out.json`).
5. **A cancelled order added does not move it.** No interface mints a second
   order on a booked conversation, so a `cancelled` $200.00 order is inserted
   on the isolated database, in the shape `bookings_write_order` produces, and
   named in the annotations. Rows: desk's rule 50,000; the naive rule
   (total − collected over every row, computed on purpose) 70,000. Screen:
   $500.00 unchanged, the cancelled row shown as Cancelled · $0.00 outstanding ·
   "Not counted", and $700.00 nowhere on the panel (`07`).
6. **A receipt by its public code.** Typed on the Receipts screen: record,
   Awaiting payment, total $800.00, collected $300.00 (`08`); a 20-character
   code nobody minted refused with "No receipt in this workspace carries that
   code." (`08b`); `/r/<code>` opens and shows the order (`09`).
7. **Projects and milestones.** The board lists the project with "Collect the
   balance" (`10`); opening it shows Milestones and deliverables (none on this
   project; the section renders and says so) (`11`).
8. **Never offer Collect while an agreement is awaiting approval.** No
   interface drafts an amendment from the point of sale, so the accepted
   version is superseded and a `sent` v+1 inserted on the isolated database,
   then reverted in `finally` (annotated). Screen: no Collect button, the
   sentence "Collect is not offered while a version of the agreement is waiting
   on the client…" (`12`); after the revert, "Collect $500.00" is back.
9. **The gate on the server.** `projectsCollect` reloads the project through
   the reader and runs `collectVerdict` before touching the engine
   (`projects-actions.ts`); covered by `projects-mode-model.test.ts` (closed
   project, deliverable awaiting, agreement awaiting, nothing owed, mixed
   currency, deposit over the balance, the oldest owed record chosen), not by
   a stale-tab browser step.

## Defects found on the way (not this mode's; not fixed here)

1. **Client self-onboarding cannot complete.** `complete_client_onboarding()`
   sets `profiles.account_status = 'active'`, but the BEFORE UPDATE trigger
   `guard_profile_self_update` (`20260408113000`) reverts `account_status` and
   `onboarding_completed_at` whenever `auth.uid()` is the row's own id, and the
   RPC runs as the user. The relationship IS written, the profile stays
   `onboarding`, and `auth-routing.ts` bounces every GET to `/onboarding/role`
   forever. Observed on runs 9 and 10 (`sql/03-client-claim.run20.out.json`
   shows the corrected row). The spec sets the status with the service role
   (`auth.uid()` null, guard not applied) and annotates it. The two
   `c08-cus-*` fixture accounts carry the same `onboarding` status, so
   `C08-CUS accept` is likely failing for the same reason. Owner: auth /
   onboarding.
2. **The public receipt says nothing about a partial payment.** `/r/<code>`
   shows the order's total and lines and calls them "Your tickets"; a client who
   paid a $300.00 deposit on an $800.00 project reads $800.00 and nothing about
   what was paid or what is owed. Owner: receipts.
3. **`/talent/inbox/<id>` does not reliably select the conversation** on a cold
   compile; the spec falls back to the list. Owner: talent inbox.
4. **The thread route `/admin/messages/<id>` cannot edit the lineup** ("Add
   talent from classic Messages") and links back to `?inquiry=`, which the
   classic page does not read; classic Messages has no deep link, so a spec
   finds the thread by the client's name. Owner: messages.
5. **`next dev` restarted itself on the memory threshold mid-run** (run 18,
   "Server is approaching the used memory threshold, restarting"); the run
   timed out on the settings page. Environment, not application.
6. A project's title reads "Nadia Varela — booking" with an em dash; that is the
   reader's title from the booking row, not this mode's copy.

## Decisions taken

- The mode's landing view is `collect` (Due in the design); Links has no table
  and Issues is the workspace's inbox, so the rail is Collect · Projects ·
  Receipts.
- The mode's Collect gate is STRICTER than the project page's: `nextProjectAction`
  suppresses Collect while a deliverable awaits the client; the mode also
  refuses while any agreement version is `draft`/`sent` on top of an accepted
  one (O06/O07). Both are sentences in three languages.
- A collection goes against the OLDEST owed record (sorted by id, so two
  tablets pick the same one); allocation across records is not recorded
  anywhere (the project page's own ruling).
- A deposit equal to the balance IS the balance; one above it is refused before
  the engine would call it `amount` (the engine's word for "someone else got
  there first").
- The idempotency key is the counter's `posCollectionKey` over order, version,
  method and amount, and `expectedVersion` is the version the screen loaded.

## Gates (exit codes from the commands themselves; `runs/*.txt`)

| Command | Exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.pos-projects.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.pos-projects.tickets npm run typecheck` | 0 (`typecheck.txt`, verdict file `/tmp/tulala-tsc.708a056c.last`, this checkout's key; run three times: before the split, after it, and after the loader fix, 0 each) |
| `npm run lint` | 1 once (`lint-red-max-lines.txt`: the predecessor's client was 873 lines against a budget of 800; two screens moved to `projects-mode-screens.tsx`, no suppression added), then 0 (`lint.txt`) |
| `npm run test:money` | 0 (992 tests, 991 pass, 1 pre-existing skip; `test-money.txt`; includes `projects-mode-model.test.ts`, 17 tests) |
| `npm run test:phase1-i18n` | 0 (20/20; `test-phase1-i18n.txt`; every `dashboard.pos.projects.*` key used and present in en/es/fr) |
| `npm run test:size-ratchet` | 1 once (`test-size-ratchet-red-unchecked-read.txt`: the guard caught a Supabase read-back in `ensureReceiptCode` that dropped its error; fixed by acting on it, not annotating it), then 0 (173/173; `test-size-ratchet.txt`) |
| `npx tsx --test src/lib/pos/modes.test.ts` | 0 (9/9; and 8/9 with the `client` alias removed, restored after) |
| Playwright, runs 1-18 | 1 each (spec faults listed above, one build error from the first merge, one dev-server memory restart) |
| Playwright, runs 19, 20 (`POS_PROJECTS_FRESH_SEED=1`), 21 (after the split and the loader fix) | 0, 0, 0 |

Also added on the way: `POS_PROJECTS_FRESH_SEED=1` on the spec, and
`e2e/cases/POS-projects-collect-a-balance.spec.ts` now seeds its own
conversation instead of consuming another proof's leftover offer.

## Not done

- **Not proven on the deployed QA host** (see the top).
- **Card and payment link** are refused in the counter's sentences (no reader,
  no Stripe key on this fixture); `online_card` is wired through the same
  `startCollection` but was not exercised.
- **The engine's own refusals in a browser** (someone else collected first,
  the amount changed, a product that needs a name): the mapping is the
  counter's `refusalFromResult` + `PosRefusalBanner`, unit-tested in
  `refusal-reason.test.ts`; the mode's own `order_changed` is checked by the
  server action and covered by the model tests, not raced in a browser.
- **A draft order attached to a project**: no interface path makes one (same
  as prove-money), and the desk's rule excludes it by unit test.
- **Spanish and French screens** were not opened in a browser; every string is
  in the three catalogues and the key-usage guard is green.

## Fixture state left behind

Per fresh-seed run: one guest inquiry (`pos-projects-<ts>@impronta.test`),
its lineup, offer and approvals, one booked project with one `pending_payment`
$800.00 order carrying a $300.00 cash deposit and a receipt code, one
`cancelled` $200.00 order, one claimed client account with an active
relationship, and one `booking_transactions` row per deposit in the sibling's
open drawer `ad377f08…`. The agreement mutation is reverted. Nothing was
deleted.
