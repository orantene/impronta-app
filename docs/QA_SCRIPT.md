# Real-Agency QA Script — Round 1

Purpose: put the admin builder in front of a non-technical agency operator and
see whether the loop **edit → preview → review → publish** feels premium,
trustworthy, and effortless. We are no longer proving architecture; we are
measuring felt product quality.

---

## Tester profile

One tester per session. Target three sessions total for Round 1.

- **Primary:** agency owner or coordinator responsible for a small roster
  (1–15 talents). Manages inquiries, bookings, calendar. Technical comfort:
  "I use Squarespace / Shopify / Notion but I do not write code."
- **Acceptable alternatives:** an agency's marketing manager, an events
  producer who staffs talent, or a studio manager. Avoid designers and
  developers for Round 1 — they will filter out rough spots we want to hear.
- **Not acceptable for Round 1:** anyone who has already seen the builder
  internally. We need fresh eyes.

Recruit three testers across two verticals so we can separate
"Editorial Bridal is rough" from "the builder is rough."

---

## Tenant setup (admin side, before the session)

**Per tester**, an hour before their session:

1. Create a fresh tenant + owner. In staging:
   - Insert an `agencies` row with `kind='subdomain'`.
   - Insert an `agency_domains` row (e.g. `qa-tester-1.lvh.me` in dev,
     `qa-tester-1.agency.demo` in staging).
   - Create the owner `auth.users` + `public.profiles`
     (`app_role='agency_staff'`, `account_status='active'`,
     `onboarding_completed_at != null`) and a
     `public.agency_memberships` row with `role='owner'`.
   - `scripts/reset-midnight-owner.mjs` is the reference pattern; adapt.
2. Seed a minimal roster (3–5 talent profiles, no M8 editorial fields).
   Agencies need *something* to point at; totally empty rosters distort
   the test because the agency has to think about their own talent.
3. Do **not** pre-apply a theme preset or a homepage composition. The
   first-run experience needs to land on the blank welcome state.
4. Verify the tenant's storefront 200s on the subdomain and shows the
   "empty homepage" fallback.
5. Confirm the admin login works and lands on `/admin` without redirect
   loops.

Record per tester before the session:

- Tenant id, owner email, subdomain.
- Roster size, talent names.
- Session date, tester name, facilitator name.

---

## Session structure (45 min)

| Minutes | Phase |
|---|---|
| 0–3 | Intro + consent + recording on |
| 3–30 | Guided tasks (this script) |
| 30–40 | Open exploration, tester leads |
| 40–45 | Scoring + open comments |

Keep the tester talking. "What are you looking at right now?" "What did you
expect when you clicked that?" Don't coach. Don't defend. Don't pre-explain
where buttons live.

---

## Guided tasks

Each task lists the **goal**, **success criteria**, **what to observe**,
and **what we'll score**.

### Task 1 — Log in and find the builder

**Goal:** tester reaches `/admin/site-settings/structure` without help.

**Success:** reaches the Structure page within 90 seconds of login.

**Observe:**
- First surface they land on after login.
- Whether they hesitate in the sidebar.
- Whether they click into the wrong sub-item first (Branding, Design,
  Navigation are all reasonable wrong guesses).

**Score:** effortless (0–5) — how natural was the navigation.

### Task 2 — Pick a starter

**Goal:** apply the Editorial Bridal starter and reach a drafted homepage.

**Success:** tenant shows a populated draft composition; preview iframe
shows the tenant's storefront with the banner *Preview — showing draft*.

**Observe:**
- Whether the three starter tiles communicate enough for the tester to
  choose confidently.
- Whether they read the help text or click immediately.
- Any wait that feels too long.
- Whether they notice the preview iframe updating.

**Score:**
- Premium (0–5) — did the tiles + landing state feel designed?
- Trust (0–5) — did the tester feel safe clicking "Start from this preset"?

### Task 3 — Edit a hero

**Goal:** change the homepage hero's headline + one subheadline, and
watch it reflect in preview.

**Success:** headline change appears in preview within a reasonable time
(target: under 3 seconds after autosave fires) and the autosave chip
shows "All changes saved."

**Observe:**
- Whether the tester knows where to edit from the Structure page (do they
  find the Sections list? or do they look for inline-edit on canvas?).
- Whether the autosave chip is noticed — ask them about it afterwards.
- Whether they trust it without hitting Save.
- Whether they switch back to Structure to see preview update.

**Score:**
- Trust (0–5) — does the tester believe the change is saved without a
  confirmation?
- Effortless (0–5) — is the flow between edit and preview smooth?

### Task 4 — Add a section from the library

**Goal:** add a *Gallery* section (or any one they hadn't yet) to a slot
via the library overlay and drag-reorder it.

**Success:** section is added, appears in preview after next save, is
re-ordered to a different position, and saves without prompts.

**Observe:**
- Whether "+ Add from library" reads as the primary call-to-action or
  if they look for the secondary "Reuse a saved section" dropdown first.
- How the schematic thumbnails read — do they help picking, or are they
  noise?
- Whether they realize drag-and-drop is supported without being told.
- Whether undo is ever triggered (intentionally or accidentally).

**Score:**
- Premium (0–5) — did the library feel like a product tool or a form?
- Effortless (0–5) — how confident were their picks?

### Task 5 — Upload an image

**Goal:** replace a section's image via the MediaPicker's Upload flow.

**Success:** tester uploads an image from their own machine, it appears
as the first tile in the picker, and is auto-selected into the field.

**Observe:**
- Whether they click Upload first or look for Browse.
- Whether the MIME/size guardrails confuse or reassure.
- Whether the auto-select behavior on upload feels magical or surprising.

**Score:**
- Premium (0–5) — does the picker feel like a media surface?
- Effortless (0–5) — one motion, or multi-step friction?

### Task 6 — Review + publish

**Goal:** open the publish pre-flight, inspect the diff, and publish.

**Success:** tester reaches a clean pre-flight (no blockers), reviews
the visual diff, and commits.

**Observe:**
- Whether they notice the summary tiles at the top.
- Whether they read the added / removed / reordered rows.
- Whether the "Publishing is reversible from Revisions" copy reassures.
- Whether the primary button copy ("Publish to live") feels right vs.
  scary.

**Score:**
- Trust (0–5) — did they feel in control of what was about to land?
- Premium (0–5) — did the modal feel like a product decision surface?

### Task 7 — Recover from a mistake

**Goal:** intentionally delete a section, then either undo or restore
the pre-delete revision.

**Success:** section returns to the composition via undo (fast path) or
via the Revisions drawer (Preview → Restore as draft).

**Observe:**
- Whether they discover the undo button unaided, or try Cmd+Z.
- Whether they scroll to Revisions if they miss undo.
- Whether the Revision preview modal reassures them about what they're
  about to restore.

**Score:**
- Trust (0–5) — did they fear losing work at any point?
- Effortless (0–5) — how fast to recover?

### Task 8 — Fill an editorial profile

**Goal:** go to `/admin/talent/[id]` for any talent on the roster, fill
three M8 fields (intro italic + event styles + one package teaser),
save, then view the talent's public profile.

**Success:** the changes appear on `/t/TAL-XXXXX` after save.

**Observe:**
- Whether the editorial fields section is discoverable or buried.
- Whether "Comma-separated" copy for chip arrays is sufficient.
- Whether the JSONB row editors feel intuitive or awkward.
- Whether they notice their changes landed on the public profile.

**Score:**
- Premium (0–5) — does the profile render look like the prototype?
- Trust (0–5) — confidence that the changes are live?

---

## Open exploration (10 min)

Ask them to pick anything they want to try. Do not guide.

**Observe:**
- What do they click next?
- What do they look for that isn't there?
- What do they assume is broken that isn't?

---

## Scoring (5 min)

Walk them through a short exit survey:

**Three scales, 0–5:**

1. **Premium** — "Did this feel like a polished product?"
2. **Trustworthy** — "Did you believe what you were seeing?"
3. **Effortless** — "Could you operate this without someone holding your
   hand?"

**Two open questions:**
- "What is the one thing that would make this feel more like a product?"
- "If you opened this cold tomorrow, what would scare you?"

---

## Success criteria for Round 1

We are **ready to iterate and plan Round 2** when:

- At least 2 of 3 testers scored Premium ≥ 4, Trustworthy ≥ 4,
  Effortless ≥ 3.
- Zero hard blockers across all three sessions (see QA_FEEDBACK.md).
- Time-to-first-publish under 20 minutes in all three sessions.
- No tester feared losing work during Task 7.
- Every tester successfully published at least once without help.

If we miss two or more of those criteria we do a focused polish sprint
before Round 2.

---

## What the facilitator records during the session

Run a simple recording (screen + voice, with consent). Keep a short
paper note sheet with four columns:

- **Time** (minute mark)
- **What happened** (one line)
- **Tester's words** (short quote)
- **Severity hunch** (B / C / T / P / F — see QA_FEEDBACK.md)

Do not try to annotate live. Capture, score, sort after.

---

## Post-session within 24 hours

1. Transcribe quotes into findings using the QA_FEEDBACK.md template.
2. Score each finding with the framework's severity + category.
3. File spawned tasks for clear bugs.
4. Queue polish items for the next sprint.
5. Update `docs/QA_FINDINGS.md` (one file, running log, grouped by
   session).

---

## Out of scope for Round 1

Do not test:
- Custom domain setup.
- Multi-locale.
- Inquiry / booking pipeline.
- End-client profile editing.
- SEO config.
- Analytics.
- Talent submission / approval flow.

Those surfaces have not had the premium/trust pass yet. Testing them
now would generate low-signal feedback and bury the signal from the
builder loop.
