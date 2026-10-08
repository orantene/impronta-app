---
cursor:
  subagentId: "bc-1bc0ffdd-d8d1-5dc4-ace9-3068f82674f7"
---

# Edit site → broken page builder (Jorg Beauty LIVE)

Updated: 2026-10-04 · Agent `bc-1bc0ffdd-d8d1-5dc4-ace9-3068f82674f7`  
Account: `oranteneai@gmail.com` → **Jorg Beauty** · **TAL-JORGBEAUTY** · host `app.tulala.digital`  
Oran report shot: [`media/edit-site-builder-bug/oran-report-edit-site-broken.png`](../media/edit-site-builder-bug/oran-report-edit-site-broken.png)

## Verdict

| Item | Result |
|---|---|
| Root cause | Soft client nav from My presence into `/talent/page-builder` kept `TalentShellClient` mounted (shared talent layout does **not** remount). SPA stacked under the WYSIWYG Maison canvas → looked like a stuck full marketing site. Secondary: ghost presence peer named `"You"` → banner **You is also editing this page**; `onExit` not forwarded from talent mounts. |
| PR | [#2510](https://github.com/orantene/impronta-app/pull/2510) · branch `cursor/edit-site-hard-nav-74f7` |
| Tip at repro | `56f0c147d` · deploy `dpl_AmBn9M3MC1xFBBVnqJe1hQfydBJK` |
| LIVE prove after merge | **PENDING** (await CI → merge → tip) |

## Repro (LIVE tip `56f0`)

1. Login → My presence → My website (Maison v2 · Rosé).
2. Soft-click **Edit site** (`maison-edit-site` → `/talent/page-builder`).
3. Observed: builder chrome *can* mount, but soft nav left My presence SPA + preview iframe still in the DOM below the long canvas; presence banner **You is also editing this page**.
4. Hard load of `/talent/page-builder` was bare (no talent surface) — confirms layout remount gap.

### Evidence

| Shot | What |
|---|---|
| [oran-report-edit-site-broken.png](../media/edit-site-builder-bug/oran-report-edit-site-broken.png) | Oran’s failure report (full-site chrome / unusable) |
| [01-my-presence-before.png](../media/edit-site-builder-bug/01-my-presence-before.png) | My presence before Edit site |
| [02-edit-site-after-click.png](../media/edit-site-builder-bug/02-edit-site-after-click.png) | Soft-nav Edit site (chrome present; stacked shell leftover) |
| [03-after-select.png](../media/edit-site-builder-bug/03-after-select.png) | Heading selected + **You is also editing** |
| [04-hard-nav.png](../media/edit-site-builder-bug/04-hard-nav.png) | Hard nav bare builder control |

## Fix (forward)

1. **Canonical route** — `/talent/page-builder` (+ `/talent/onboarding`) in `CANONICAL_ROUTE_MATCHERS` so `ConditionalAdminShellRoot` yields on soft nav (`canonical-routes.ts`).
2. **onExit** — `TalentMaxBuilderMount` / `TalentSiteShellBuilderMount` forward `onExit` with `headerVariant="lab"`; Exit hard-assigns `/talent/site`.
3. **Presence** — `summarizeOtherEditors` treats ghost `"You"` / same-name null-`userId` peers as my other tabs, not strangers.

## LIVE prove checklist (post-merge tip)

- [ ] My presence → Edit site → URL `/talent/page-builder`
- [ ] `[data-edit-topbar]` + left command dock visible
- [ ] Click hero heading → selection handles
- [ ] No My presence SPA / `maison-edit-site` still in DOM
- [ ] No **You is also editing this page** when alone
- [ ] Exit returns to `/talent/site`

**LIVE PASS/FAIL:** pending tip after [#2510](https://github.com/orantene/impronta-app/pull/2510).

## Follow-on full audit

Oran wants a **full page-builder + dashboard function audit** once tip is fully in production. Stub only — do not block this fix.

### Page builder

- [ ] Edit site entry (My presence, avatar Builder, Apps add)
- [ ] Topbar: Exit, device frames, undo/redo, View site, Publish
- [ ] Left rail: Add / Pages / Structure / Design / Assets / Help
- [ ] Canvas: select, move, inline text, delete, zoom
- [ ] Right rail: Layout / Content / Style / Animation
- [ ] Shell edit (`?shell=1`)
- [ ] Presence banner (multi-tab / multi-user) copy + ES
- [ ] Theme update notice on builder
- [ ] Locked Free editor vs Web Office unlocks
- [ ] Mobile 390 builder chrome

### Dashboard (talent)

- [ ] Today / Messages / Calendar / Clients / Money / Profile
- [ ] My presence tabs + Change design / Colors / History / Apps / Domain / Website settings
- [ ] Services / Reviews / Settings / Payouts / Attention
- [ ] Avatar menu destinations + TAL code subtitle
- [ ] Preview eye vs Edit site (no confusion)

### Public

- [ ] `book-jorgelina.tulala.digital` Maison v2 · Rosé still matches dashboard claim
