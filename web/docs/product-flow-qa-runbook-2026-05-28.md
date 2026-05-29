# Product-Flow QA Runbook — the "one new customer" story

**Created:** 2026-05-28
**Companion to:** [`product-flow-remediation-plan-2026-05-28.md`](./product-flow-remediation-plan-2026-05-28.md) (the 27 issues + 6 phases) and [`remediation-phase-prompts-2026-05-28.md`](./remediation-phase-prompts-2026-05-28.md) (the copy-paste phase prompts).

This runbook turns the 7-step customer story into an **executable test script**. It is two things at once:

1. **An acceptance test** — when all 6 phases (A–F) are done, every box here should be checked ✅. That's the definition of "the product works end-to-end."
2. **A current-state diagnostic** — if you run it **today**, most of steps 1–6 will FAIL or be PARTIAL. That is expected, and each failure is mapped to the phase that fixes it. Don't treat today's failures as regressions.

---

## 0. How to read each test

Every scenario has the same shape:

| Field | Meaning |
|---|---|
| **Steps** | Exact clicks / URLs to perform. |
| **Expected (DONE)** | What you should see once the relevant phase has shipped. |
| **Today** | What actually happens right now, before that phase. |
| **Fixed by** | The phase (A–F) that closes the gap. |
| **Record** | `[ ] PASS / [ ] FAIL` + a notes line. |

**Status legend** used in the headers:

- ✅ **Should pass today** — no phase needed; if it fails, it's a regression, stop and investigate.
- ⚠️ **Partial today** — some of it works, some doesn't.
- ❌ **Blocked today** — will fail until its phase ships. Expected.

---

## 1. Environment setup (do this once, every session)

1. **Start the dev server**
   ```
   cd web && npm run dev
   ```
   Serves on **port 3000**. Dev/QA/prod all point at the **same** remote Supabase (`pluhdapdnuiulvxmyspd`), so what you see locally is real production data.

2. **If every path 404s, or you see a stale parse error / "Cannot read properties of undefined" right after a restart** — this is the #1 local time-sink and it is almost never a code bug. It's a bloated Turbopack cache. Fix, in order:
   ```
   # stop the dev server
   rm -rf /Users/oranpersonal/Desktop/impronta-app/web/.next
   # restart; first compile is cold (a few minutes)
   ```
   Don't debug env / middleware / RLS until you've cleared `.next` first.

3. **Browser:** Google Chrome (the project's QA browser).

4. **Base URL for ALL local QA:** **`http://localhost:3000`**
   - Why `localhost` and **not** `app.lvh.me` for workspace pages: the middleware (`web/src/proxy.ts`) only does path-based tenant routing (`/<slug>/admin`, `/<slug>/...`) when the host is literally `localhost` / `127.0.0.1`. On `*.lvh.me` it would try to resolve the tenant from the **subdomain**, which is only seeded for a few demo hosts — so `/<slug>/...` 404s there. Use `localhost`.
   - `*.lvh.me` is only useful for simulating a production **subdomain** host, and only when that exact host is seeded in `agency_domains`. For everything in this runbook, `localhost` is the reliable route.

5. **Production base URL** (after a deploy, for the real subdomain/domain test in Scenario 6): **`https://hotels-express.tulala.digital`** — this is the actual seeded subdomain for the test workspace.

---

## 2. Test accounts

| Role | Email | Password | Use for |
|---|---|---|---|
| **Super admin** (platform console + owner of the test workspace) | `orantene@gmail.com` | `1234!@#$Oran` | `/platform/admin/*`, and as the workspace owner |
| Agency admin (generic QA) | `qa-admin@impronta.test` | `Impronta-QA-Admin-2026!` | workspace admin shell |
| Client | `qa-client-1@impronta.test` | `Impronta-QA-Client-2026!` | Scenario 7 (sending an inquiry) |
| Talent | `tulum-talent-sofia@impronta.test` | `Impronta-Tulum-Talent-2026!` | talent surface checks |

**One-click dev sign-in** (dev only — 403 in prod). Signs in and drops you exactly where you want to land:
```
http://localhost:3000/api/dev/signin?email=<EMAIL>&password=<PW>&next=<PATH>
```
⚠️ **URL-encode special characters in the password**, especially `#` (an un-encoded `#` truncates the URL). Ready-to-paste versions:

- **Owner → workspace admin:**
  `http://localhost:3000/api/dev/signin?email=orantene@gmail.com&password=1234%21%40%23%24Oran&next=/hotels-express-lavanderia/admin`
- **Owner → platform console:**
  `http://localhost:3000/api/dev/signin?email=orantene@gmail.com&password=1234%21%40%23%24Oran&next=/platform/admin/tenants`
- **Client → directory:**
  `http://localhost:3000/api/dev/signin?email=qa-client-1@impronta.test&password=Impronta-QA-Client-2026%21&next=/`

---

## 3. The test workspace (already created — use this one)

| Field | Value | Note |
|---|---|---|
| Display name | **Hotels Express Lavanderia** | A laundry/hotel-services business in Playa del Carmen — deliberately NOT a fashion agency, to test that the product fits any service business. |
| Slug | **`hotels-express-lavanderia`** | Used in all local path URLs. |
| Plan | **`free`** | ⚠️ Free plan **gates the owner-side domain UI behind Studio** — so the owner cannot self-connect a domain from workspace settings. Domain work must be done from the platform console, or bump the plan to Studio first. Capture this in Scenario 6. |
| Kind | `agency` | |
| Owner | `orantene@gmail.com` | |
| Seeded domain | `hotels-express.tulala.digital` (subdomain, status active) | 🐞 **`is_primary = false`** — a workspace's only domain should be primary. Log this as a finding in Scenario 6. Also note the host (`hotels-express`) ≠ the slug (`hotels-express-lavanderia`). |

**Key local URLs for this workspace:**

| What | URL |
|---|---|
| Public homepage (what a visitor sees) | `http://localhost:3000/hotels-express-lavanderia` |
| Owner dashboard | `http://localhost:3000/hotels-express-lavanderia/admin` |
| Platform console (manage this tenant) | `http://localhost:3000/platform/admin/tenants` |
| Production subdomain (after deploy) | `https://hotels-express.tulala.digital` |

---

## 4. Pre-flight (30-second DB sanity check, optional)

Confirm the workspace and its domain still look as expected before you start clicking. In the platform console (`/platform/admin/tenants`), open **Hotels Express Lavanderia** → the Manage drawer. Verify: status **Active**, plan **Free**, one domain `hotels-express.tulala.digital`. If the domain shows the **NO DOMAIN** amber callout instead, the seed was lost — reseed before continuing.

---

# The 7 scenarios

## Scenario 1 — Signup → an instant working homepage  ❌ (Phase A)

> *"She signs up → she immediately has a live website. Not a blank page, not an error."*

**Steps**
1. Open an **incognito** window (no session).
2. Go to `http://localhost:3000/hotels-express-lavanderia`.

**Expected (DONE):** A real, branded homepage renders — workspace name, a hero, some default sections. HTTP 200. Looks intentional, not empty.

**Today:** There is no root page for `[tenantSlug]` (only `/admin`, `/client`, `/talent` exist), so the homepage **404s or renders nothing**. This is the single most important gap — a brand-new workspace has no front door.

**Fixed by:** **Phase A** (every workspace gets a default storefront homepage at create time).

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

## Scenario 2 — Owner dashboard shows REAL data, zero fakes  ❌ (Phase B)

> *"She logs into her dashboard → she sees her business: her name, her team, her real numbers."*

**Steps**
1. Sign in as owner using the **Owner → workspace admin** dev-signin link (Section 2).
2. Land on `http://localhost:3000/hotels-express-lavanderia/admin`.
3. Read the Overview tab end to end. Look at every name, number, logo, and chart.

**Expected (DONE):** Everything on screen belongs to **Hotels Express Lavanderia**. Empty states say "no data yet," not fake numbers.

**Today:** The admin shell renders **prototype fixtures** — you will likely see `acme-models`, **"Vogue Italia"**, a hard-coded **"4,730 visits"**, mock bookings, mock top performers. None of it is this workspace's data.

**Fixed by:** **Phase B** (replace the `PROTO_TENANT_ID` / `WEBSITE_STATE` / `MOCK_BOOKINGS` / `TOP_PERFORMERS` fixtures with real tenant-scoped reads).

**The "no fake data" sweep** — while you're here, hunt for any of these strings anywhere in the shell. Each one found = a FAIL:
- [ ] "Vogue Italia" / "Acme" / "acme-models"
- [ ] "4,730" (or any suspiciously round hard-coded metric)
- [ ] A talent/booking/message that doesn't belong to this workspace
- [ ] A "Demo" badge on a metric that should be real

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

## Scenario 3 — Build & publish a page (white bg, blue text)  ⚠️ (Phase C)

> *"She designs her pages → white background, blue text, her logo. She hits publish, and the page is live at her web address."*

**Steps**
1. As owner, open the page builder (Admin → Site / Pages → edit the home or a new page).
2. Set the page **background to white** and a heading/body **text colour to blue**.
3. Add a section with some real copy (e.g. "Laundry & linen services for hotels in Playa del Carmen").
4. **Save.** Then **Publish.**
5. Open the public URL in incognito: `http://localhost:3000/hotels-express-lavanderia`.

**Expected (DONE):** The published page renders publicly with the white background and blue text exactly as designed. A hard refresh keeps the changes (they persisted to the DB, not just local state).

**Today:** The builder UI exists but the save/publish round-trip is **not fully wired** — edits may not persist, or "Publish" doesn't surface the page at the public URL. (Compounded by Scenario 1: there's no public home route yet.)

**Fixed by:** **Phase C** (page-builder persistence + publish → public render).

**Sub-checks:**
- [ ] Save shows an explicit "saved" state (no silent wait).
- [ ] Reload the editor → my changes are still there.
- [ ] Publish → the public page reflects them.
- [ ] White bg + blue text actually render publicly.

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

## Scenario 4 — Add team / services; nothing lost; right taxonomy  ⚠️ (Phase D)

> *"She adds her cleaners, or rooms, or packages. Nothing she types gets lost. The categories make sense for her business."*

**Steps**
1. As owner, go to **Roster / Add talent** (this is the "add a person/service" flow).
2. Add an entry that fits a **laundry/hotel** business — e.g. name "Laundry Pickup — Standard", or a staff member.
3. Fill several fields, including a category/specialty.
4. Save. Re-open the entry.
5. Go to the public roster/directory for the workspace and confirm it appears.

**Expected (DONE):**
- Everything typed is saved — nothing silently dropped.
- The category taxonomy offers **service-business** options (housekeeping, laundry, logistics, hospitality…), not only fashion-model specialties.
- The entry publishes to the public roster.

**Today:**
- Add-talent can **lose work** on certain field types (silent failures).
- The taxonomy is **fashion/talent-only**, which is nonsensical for a laundry business.

**Fixed by:** **Phase D** (resilient add-talent + a service-oriented taxonomy + publish-to-roster).

**Sub-checks:**
- [ ] All fields I entered survive a save + reopen.
- [ ] Category list fits a non-fashion business.
- [ ] Failed uploads/fields show an explicit error (never silent).
- [ ] Published entry appears on the public roster.

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

## Scenario 5 — Every dashboard button works  ⚠️ (Phase E)

> *"Messages, inquiries, operations — all show real information, nothing is a dead placeholder."*

**Steps** — visit each top-level admin tab and confirm it loads real, tenant-scoped data (not a placeholder, not a 500, not fixtures):
- [ ] Overview
- [ ] Roster
- [ ] Inquiries
- [ ] Messages
- [ ] Pitches
- [ ] Operations
- [ ] Reach / Directory
- [ ] Settings
- [ ] Any others present in the nav

**Expected (DONE):** Each tab loads, shows this workspace's real data (or a clean empty state), and its primary action works.

**Today:** Several tabs are **placeholders or wired to fixtures**; some actions are dead ends.

**Fixed by:** **Phase E** (real data + working actions on every tab; Free-tier owner can see their subdomain).

**Record (per tab):** mark each box above PASS, and note any FAIL tab + symptom: ________________________

---

## Scenario 6 — Connect her own domain  ⚠️ (works from platform console today; Phase F polish)

> *"She connects her own domain → it just works."*

⚠️ **Important plan caveat:** this workspace is **Free**, and the **owner-side** domain UI is gated behind **Studio** (`meetsPlan(state.plan, "studio")`). So there are two valid paths:

**Path A — from the platform console (works today):**
1. Sign in as owner → `http://localhost:3000/platform/admin/tenants`.
2. Open **Hotels Express Lavanderia** → Manage → **Domains**.
3. Confirm the seeded `hotels-express.tulala.digital` (subdomain).
4. 🐞 **Check `is_primary`** — it is currently **false**. Use **Set primary** and confirm it sticks and the list refreshes in place.
5. Add a custom host (e.g. your real domain). Confirm:
   - [ ] A **Tulala** host (`*.tulala.digital`) auto-flips the kind dropdown to **Subdomain** (the auto-detect fix).
   - [ ] A real external domain stays kind **Custom** and is accepted.
   - [ ] The mismatch warning + disabled Add button behave (try a `*.tulala.digital` host left on "Custom").
6. Remove a non-primary domain → confirm the **Remove** button appears for subdomains and the removal refreshes in place.

**Path B — from workspace settings (requires Studio):**
1. In the platform console, apply a **plan override → Studio** to this workspace (or change its plan).
2. As owner, go to workspace **Settings → Domains**. The DomainDrawer should now be available.
3. Add/verify a domain there.

**Production domain test (after a deploy):**
1. Point your real DNS (CNAME) at the platform per the in-app instructions.
2. Visit `https://hotels-express.tulala.digital` (and your custom domain once verified).
3. Confirm the storefront renders on the real host (depends on Scenario 1 being done).

**Expected (DONE):** Owner can connect a domain self-serve (within plan rules), the sole domain is primary, and the public site answers on it.

**Fixed by:** the platform-console domain system **already works** (the 5 bugs were fixed this session). **Phase F** polishes the owner-side self-serve path, the Free-plan messaging, and the `is_primary` default.

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

## Scenario 7 — Client finds the page, sends an inquiry (end-to-end)  ❌ (needs A + D)

> *"A client finds her page and sends an inquiry → it lands in her dashboard."*

**Steps**
1. Incognito (or as `qa-client-1`): open the public workspace page / roster (`http://localhost:3000/hotels-express-lavanderia`).
2. Pick a service/person and start an inquiry (Request booking / contact).
3. Fill and submit the inquiry.
4. Sign in as owner → Admin → **Inquiries**. Confirm the inquiry is there.
5. Open the thread; confirm the conversation works (send a message back).

**Expected (DONE):** The inquiry submits from the public page, lands in the owner's Inquiries, and the booking conversation happens inside the platform.

**Today:** Blocked upstream — there's no public homepage (Scenario 1) and the roster isn't published for a service business (Scenario 4). The inquiry **engine** itself is sound; the entry points aren't there yet.

**Fixed by:** **Phase A** (public page) + **Phase D** (published roster). Once both land, this should pass without engine changes.

**Record:** `[ ] PASS  [ ] FAIL` — notes: ________________________

---

# Cross-cutting sweeps (run after the 7 scenarios)

### A. No-fake-data audit (Phase B acceptance gate)
Walk the whole owner experience (every tab, the public page) and confirm **not a single** fixture string appears: `acme`, `Vogue Italia`, `4,730`, mock performers, mock bookings, any talent that isn't this workspace's. One sighting = Phase B not done.
- [ ] Clean

### B. Responsive / mobile
The product is mobile-first (108px header spec). On a phone viewport (Chrome devtools, iPhone):
- [ ] Owner dashboard is usable, nav reachable, no clipped overlays.
- [ ] Public page is readable and the inquiry CTA is tappable.
- [ ] Open an overlay (menu/drawer) and confirm it's not clipped by an `overflow:hidden` ancestor.

### C. Multi-role matrix
Spot-check the same workspace from each role (use the dev-signin links):
- [ ] **Owner** — full admin.
- [ ] **Staff/manager** (add one via Manage → members) — sees admin, restricted where expected.
- [ ] **Talent** — talent surface loads, no admin leakage.
- [ ] **Client** — client surface + can send an inquiry; cannot see admin.

---

# Regression checks — the 5 bugs fixed this session (must STAY fixed)

These already work. If any fails, a later change broke it. ✅ should all pass today.

1. **Domain kind auto-detect** — in Add Domain, typing a `*.tulala.digital` host auto-flips the kind to "Subdomain"; a `*.tulala.digital` host left on "Custom" shows an amber warning and disables Add.
   `[ ] PASS  [ ] FAIL`
2. **Subdomain Remove** — a non-primary subdomain shows a working **Remove** button (was hidden before).
   `[ ] PASS  [ ] FAIL`
3. **Status change refreshes in place** — freeze/activate/cancel updates the drawer immediately and shows a brief "refreshing…" indicator; no stale state, no double-read.
   `[ ] PASS  [ ] FAIL`
4. **List-page override stat refresh** — applying/removing a plan override updates the tenants list stat without a manual reload (REFRESHING indicator).
   `[ ] PASS  [ ] FAIL`
5. **Optimistic role/name sync** — changing a member's role updates the dropdown instantly and reconciles with the server; editing name/kind syncs form state.
   `[ ] PASS  [ ] FAIL`

---

# Sign-off

| Phase | Scenarios it unblocks | All boxes checked? | Date | By |
|---|---|---|---|---|
| **A** — default homepage | 1, (7) | ☐ | | |
| **B** — real data, no fixtures | 2, sweep A | ☐ | | |
| **C** — page builder publish | 3 | ☐ | | |
| **D** — add-talent + taxonomy + roster | 4, (7) | ☐ | | |
| **E** — every tab real + actions | 5 | ☐ | | |
| **F** — domain self-serve polish | 6 | ☐ | | |
| **End-to-end** | 7 + all sweeps + all regressions | ☐ | | |

**The product is "done" when:** an incognito visitor can land on `hotels-express.tulala.digital`, see a real branded page, browse the roster, send an inquiry — and the owner receives it in a dashboard that contains **only** their own real data. Every box above checked = that's true.
