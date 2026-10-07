# Support Desk — ready to test (2026-10-04)

Primary product URL is **live Desk** (flag already on). HTML mockups are optional chrome reference only.

## Blocker (owned elsewhere)

Oran reported **Support login / cookies / redirects broken** on the support host (incl. `/admin` → `/desk`).  
**Owner:** `bc-b893d91d` — auth + middleware + cookies. **Do not parallel-edit** those surfaces from this Desk-test thread.

Until that lands: keep using **https://support.tulala.digital/desk** as the intended entry (not `/admin`). Design feedback (dark HQ vs light mockups) can continue in-thread without waiting on auth.

## Verdict

| Item | Status |
|---|---|
| Live Desk product (#2483) | On production tip |
| `SUPPORT_DESK_ENABLED` | **`1`** on Vercel production + preview (Oran authorized 2026-10-03) |
| Host `support.tulala.digital` | Seeded `agency_domains` kind=`app`, active |
| Access gate | Platform admin (`super_admin`) only — not all tenants |
| Login/cookies on support host | **Broken — owned by `bc-b893d91d`** |
| Mockups A–I | PR [#2536](https://github.com/orantene/impronta-app/pull/2536) (optional `:3099`); #2477 closed superseded |

**Done for testing** (after auth fix) = log in on the Desk host, open queue, open a ticket, reply/note/resolve, Insights/Ideas.  
**Not done for production polish** = light theme (live is hardcoded HQ dark), mockup 1:1 chrome, agent seats, email-as-SoT, merge duplicates.

---

## 1) Primary — live Desk (use this)

### URL

**https://support.tulala.digital/desk**

Mistaken bookmark: `https://support.tulala.digital/admin` → **redirects to `/desk`** (query preserved). Do not use `/admin` on the support host — that path is talent/agency admin on `app.tulala.digital` only. See also [`support-desk-auth-fix-2026-10-04.md`](./support-desk-auth-fix-2026-10-04.md) for login/`next=`/cookie fixes.

Also works after login:

- https://support.tulala.digital/desk?view=insights
- https://support.tulala.digital/desk?view=ideas
- https://support.tulala.digital/desk?ticket=`<ticket-uuid>`
- Platform HQ Support nav (`/platform/admin/support` on `app.tulala.digital`) **redirects** into the Desk host when the flag is on.

### Login

**Intended path:** https://support.tulala.digital/desk (not `/admin` — that redirect is part of the auth fix lane).

1. Open https://support.tulala.digital/desk  
2. You should land on `/login?next=%2Fdesk` if signed out.  
3. Sign in with your **platform-admin** (`super_admin`) account.  
4. Non-admin accounts see an honest **forbidden** page (not a soft 404).

If login loops or cookies fail on the support host: that is the `bc-b893d91d` lane — not a Desk design issue.

Local /etc/hosts QA (optional): `support.local` + `SUPPORT_DESK_ENABLED=1` in `.env.local` → same `/desk` path.

### Click path (live ↔ screens A–I map)

Live Desk mounts HQ Support inside Desk chrome (`SupportDeskPortal` → `SupportHqShell`). It is **real tickets / real actions** — not the Simulated mockup banner.

| Screen | Mockup meaning | Live where to click |
|---|---|---|
| **A** Login | Desk host auth | Open `/desk` signed out → login → return to Desk |
| **B** Inbox / queue | Needs-you list | Default Desk view = support queue |
| **C** Thread | Open conversation | Click a row in the queue |
| **D** Composer | Reply / note / canned | Reply box + canned replies control in HQ shell |
| **E** Context | Customer sidebar | Ticket detail / context card in the queue drawer |
| **F** ⌘K | Command palette | Partial / HQ keyboard — not full mockup CmdK |
| **G** Empty / error | Empty queue, realtime | Empty queue when no open tickets; realtime via HQ hooks |
| **H** Mobile | Stacked mobile | Narrow viewport — HQ/Desk responsive stack (not full mockup H steps) |
| **I** Insights | Rollups | Desk URL `?view=insights` (also Ideas via `?view=ideas`) |

### What to verify (15 min)

1. Login → Desk brand chrome (“Tulala” / Support Desk header).  
2. Queue lists real open tickets.  
3. Open a ticket → thread loads.  
4. Send a **reply** (idempotent send-key path).  
5. Add an **internal note**.  
6. Resolve / reopen if safe on a test ticket.  
7. `?view=insights` and `?view=ideas` render.  
8. Sign out from Desk host (host-scoped cookies — should not wipe `app.tulala.digital` session incorrectly).

### Fake-data / Simulated banner?

**No** on live Desk. That yellow **Simulated** banner exists only on the HTML mockups (`:3099`). Live Desk talks to production support tables — treat replies as real customer-facing sends.

### Light vs dark (design)

Live Desk has **no light-theme toggle**. It reuses Platform HQ Support tokens (hardcoded dark `#0F0F11`).  
Light chrome is in the Phase 0.5 mockups only (`:3099`, default light). Converging live Desk to that light look is a separate polish PR — not an auth/cookie change.

---

## 2) Optional — Phase 0.5 mockups (design reference)

After the mockup PR tips `main` (or from the PR branch locally):

```bash
cd web && npm run mockup:support-desk
```

Open **http://127.0.0.1:3099/support-desk/**

| Screen | URL |
|---|---|
| Hub | http://127.0.0.1:3099/support-desk/ |
| A Login | …/#/login/default |
| B Inbox | …/#/inbox/needs_you |
| C Thread | …/#/thread/c1 |
| D Composer | …/#/composer/reply |
| E Context | …/#/context/rich |
| F CmdK | …/#/cmdk/default |
| G Empty | …/#/empty/inbox |
| H Mobile | …/#/mobile/queues |
| I Insights | …/#/insights |
| Journeys | …/#/journeys |

Every mockup view shows a yellow **Simulated** banner. Fake tickets only. Prototype bar: light/dark, 1440/390, role switcher.

Cloud agent can also serve `:3099` for a Live Desktop walkthrough: [Try Live](bc-867a8cbf-21f6-5a12-b6ad-4403b350a5ba#desktop)

---

## 3) PRs

| PR | Role |
|---|---|
| [#2477](https://github.com/orantene/impronta-app/pull/2477) | Original draft mockups — **superseded** (close after #2536 merges) |
| [#2536](https://github.com/orantene/impronta-app/pull/2536) `cursor/support-desk-test-ready-a5ba` | Same mockups + docs that point at live Desk; merge when CI green |

No flag flip required. Talent Messages work untouched.

---

## 4) Remaining gaps (after you finish click-testing)

- Live shell is **HQ Support reused**, not the legacy three-pane `SupportDeskShell` / mockup chrome 1:1.  
- Mockup Assist Approve/Edit/Reject, SLA countdown header, full CmdK, and mobile H step stack are **reference only**.  
- Agent seats / non–super_admin Desk roles = later phase.  
- Inbound email as Desk SoT = Phase 3 (interim forward path separate).  
- DESK-QA seed + cleanup before unblurred public screenshots.  
- Toggle off if needed: Vercel env `SUPPORT_DESK_ENABLED=0` (production + preview) — host returns dead/404 again.

---

## 5) Sources checked

- Vercel `tulala` env: `SUPPORT_DESK_ENABLED=1` (prod+preview), comment “Oran authorized 2026-10-03…”  
- Live HTTP: `support.tulala.digital/desk` → `200` login `?next=/desk`  
- Supabase `agency_domains`: `support.tulala.digital` + `support.local` active `app`  
- Plans: `docs/plans/support-desk/{SPEC,00-audit,1B-1C-GO,01-design}.md`  
- Code: `web/src/app/desk/page.tsx`, `desk-flag.ts`, `desk-access.ts`, `SupportDeskPortal.tsx`
