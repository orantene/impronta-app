# Talent dashboard LIVE audit — nothing left behind

Updated: 2026-10-04 ~01:39Z · Agent `bc-02f0f91b-668f-5234-9b36-71c8a6cc7789`  
Account: `oranteneai@gmail.com` → **Jorg Beauty** · **TAL-JORGBEAUTY** · Web Office · `book-jorgelina.tulala.digital`  
Goal: [production-talent-goal.md](./production-talent-goal.md) · Prior: [oran-live-dashboard-sweep.md](./oran-live-dashboard-sweep.md) · [TALENT-SITE-GAPS.md](./plans/done-status/TALENT-SITE-GAPS.md) · [FEATURES.md](./plans/done-status/FEATURES.md)  
Shots: [media/talent-dashboard-audit/](../media/talent-dashboard-audit/)  
Login: store `internal/oran-live-login.md` (never echoed).

## SHA / tip

| Ref | Value |
|---|---|
| LIVE tip (HTML sentry) | **`339dec9b8`** (includes #2506 · #2507 · #2508 · #2509) |
| Prior tip (full walk) | `c3214cac3` — Presence + all nav walked 2026-10-03 ~23:35Z |
| `origin/production` / `origin/main` | `339dec9b8` |
| Maison flag | `TALENT_MAISON_THEME_ENABLED=all` |
| Public Maison | **PASS** (sibling) — [jorg-beauty-live-maison.md](./jorg-beauty-live-maison.md) |
| #2506 avatar TAL code | **PASS** tip `339dec9b8` — `2506-avatar-tal-code.png` |

**Rules honored:** configure-ok only; no fake bookings / payments / QA seed on TAL-JORGBEAUTY. Paid/booking QA stays TAL-93900.

---

## Status legend

| Status | Meaning |
|---|---|
| **PASS** | Opened on LIVE tip; does the core job for a real talent |
| **FAIL** | Finished work broken, hidden, or not on tip yet |
| **PARKED** | Oran / product intentionally incomplete — reason required |

---

## Exhaustive surface table (Presence + every talent nav)

### Shell / rail

| Surface | Status | Shot | Notes |
|---|---|---|---|
| Today `/talent/today` | **PASS** | `01-today.png` | Good evening Jorg · Needs attention · Money tiles · site live card |
| Rail · Messages | **PASS** | `12-messages.png` | Messages v5 inbox LIVE |
| Rail · Calendar | **PASS** | `13-calendar.png` | Agenda calendar LIVE |
| Rail · Clients | **PASS** | `17-clients.png` | Clients list LIVE |
| Rail · Money | **PASS** | `14b-money.png` · `14c-money-owed.png` | Fee payer · Collected $0 · Owed settles to $0 + 5 requests waiting (brief Loading flash only) |
| Rail · Profile | **PASS** | `18-profile.png` | Profile editor LIVE |
| Rail · My presence | **PASS** | `03-presence-mi-sitio.png` | See Presence section |
| Rail · Services | **PASS** | `16-services.png` | Services catalog LIVE (no edits this pass) |
| Rail · Reviews | **PASS** | `19-reviews.png` | Reviews surface LIVE |
| Rail · Settings | **PASS** | `20-settings.png` · `09d-settings-tile.png` | Account settings (hours, money rules, you) |
| Plan chip Web Office | **PASS** | `26-plan-chip.png` | WEB OFFICE |
| Preview site control | **PASS** | `25-preview-control.png` | Eye / Preview site present |
| Identity · Manage website | **PASS** | `24-manage-website.png` | book-jorgelina.tulala.digital live pill |
| Attention `/talent/attention` | **PASS** | `22-attention.png` | Needs-attention queue |
| Page builder `/talent/page-builder` | **PASS** | `21-page-builder.png` | Editor opens (Maison canvas · no publish) |
| Payouts `/talent/payouts` | **PASS** | `15b-payouts.png` | Surface LIVE · **Not set up** on this real talent (expected — no fake KYC) |
| Desk `/desk` (non-admin) | **PASS** | `23-desk.png` | Honest **Platform admin sign-in required** (#2505) |
| Avatar menu destinations | **PASS** | `02-avatar-menu.png` | My website · My Tulala profile · Builder · Money · Messages · Settings |
| Avatar menu subtitle TAL code (#2506) | **PASS** | `2506-avatar-tal-code.png` | Tip `339dec9b8`: subtitle **TAL-JORGBEAUTY** (was “Talent” on `c3214cac3`). Prior fail shot kept: `02b-avatar-menu-subtitle.png`. |

### Presence `/talent/site` (exhausted)

| Surface | Status | Shot | Notes |
|---|---|---|---|
| My website tab | **PASS** | `03-presence-mi-sitio.png` | Live since Oct 2 · Maison v2 · Rosé · Your content |
| Preview canvas | **PASS** | `03b-presence-preview.png` · `09e-…` | iframe live-site preview loads (brief blank until iframe paints) |
| Change design → gallery | **PASS** | `04-change-design.png` | Choose a design · finished set · suggested ribbon |
| Colors → Design options | **PASS** | `05-colors.png` | Design options (reset / reapply / restore) |
| History | **PASS** | `06b-history.png` | Opens design restore path inside Design options |
| Apps library | **PASS** | `07-apps.png` | Library LIVE · Nail Designer in All apps · Suggested empty for lash trade (catalog has nail-only app — not a hide) |
| Domain drawer | **PASS** | `08-domain.png` | Connect + Get help LIVE |
| Domain Buy / registrar | **PARKED** | `08-domain.png` | **COMING SOON** badge — Oran parked registrar tokens |
| Questions / FAQ tile | **PASS** | `27-questions.png` | Tile opens |
| Website settings sheet | **PASS** | `09e-website-settings-wait.png` | Full list after ~2s load · Saved · live now · emergencies / languages / booking / chat… |
| Where I appear tab | **PASS** | `10b-donde-aparezco.png` | 1 live listing · Tulala profile · View/Share |
| Where I appear · visits/requests | **PARKED** | `10b-donde-aparezco.png` | UI: “Views and enquiries for this place are not available yet” — product/data not finished |
| Discover networks tab | **PASS** | `11b-descubrir-redes.png` | 2 networks · Open to join / Apply |
| Discover networks · beyond local | **PARKED** | `11b-descubrir-redes.png` | UI: “Local preview. These networks are not live for other talents yet.” |

### Public (prior sibling — not re-walked)

| Surface | Status | Evidence |
|---|---|---|
| Public Maison v2 · Rosé on book-jorgelina | **PASS** | [jorg-beauty-live-maison.md](./jorg-beauty-live-maison.md) · `media/oran-live-sweep/public-maison-live/` |

---

## #2506 fold

| Check | Result |
|---|---|
| PR state | **Merged** `56f0c147d` (sibling `bc-52bd9059`) |
| Tip LIVE | **Yes** — tip `339dec9b8` (ancestor includes #2506) |
| Avatar subtitle on tip | **PASS** — **TAL-JORGBEAUTY** (`2506-avatar-tal-code.png`) |
| Prior fail on `c3214cac3` | Kept as `02b-avatar-menu-subtitle.png` (Talent) for history |

---

## Finished-but-hidden / ship actions

| Item | Action | State |
|---|---|---|
| #2506 TAL code in avatar | Tip-proved | **PASS** tip `339dec9b8` |
| #2508 Change design/Apps fallback | On tip via `339dec9b8`; Maison=`all` also unblocks | Change design/Apps **PASS** |
| Domain Buy | Oran parked | **PARKED** — honest Coming soon |
| Visits/requests · Networks global | Product unfinished | **PARKED** — UI admits it |
| Allow-lists for finished Maison | Env=`all` | **PASS** — no cohort hide for Maison |
| Money Loading flash | Settles to $0 + waiting count | **PASS** — not stuck; no PR |
| Website settings Loading flash | Settles ~2s to full sheet | **PASS** — not stuck; no PR |

**No new code PR this pass** — tip lag cleared; remaining gaps are Oran-parked product only.

---

## Blockers that need Oran

1. **Domain registrar buy** — stay parked until Oran adds tokens (Coming soon is honest).
2. **Visits/requests + networks beyond local** — product build, not a flag flip.
3. **Money Connect on TAL-JORGBEAUTY** — real friend account; payouts “Not set up” is correct. Do **not** run fake KYC/payments on her. Paid path QA = TAL-93900 (+ captcha admin switch / Take Control owned by money agents).
4. **Platform-admin Desk portal** — still needs admin credentials (prior blocker); non-admin honest gate **PASS**.

---

## Verdict for Oran

Presence + every talent rail surface is **LIVE and working** for TAL-JORGBEAUTY on tip `339dec9b8`, including avatar **TAL-JORGBEAUTY** (#2506). Public Maison PASS. Three intentional PARKED product gaps remain (Buy domain, visits/requests, networks global) — none are finished-but-hidden.

---

## Evidence index

| File | Shows |
|---|---|
| `01-today.png` | Today LIVE |
| `02-avatar-menu.png` / `02b-avatar-menu-subtitle.png` | Menu destinations · prior tip still Talent |
| `2506-avatar-tal-code.png` | Tip `339dec9b8` subtitle **TAL-JORGBEAUTY** |
| `03-presence-mi-sitio.png` / `03b-presence-preview.png` | My website + preview iframe |
| `04-change-design.png` | Theme gallery |
| `05-colors.png` | Design options |
| `06b-history.png` | History / restore |
| `07-apps.png` | Apps library |
| `08-domain.png` | Domain setup · Buy Coming soon |
| `09e-website-settings-wait.png` | Website settings full list |
| `09d-settings-tile.png` | Account Settings |
| `10b-donde-aparezco.png` | Where I appear + visits parked copy |
| `11b-descubrir-redes.png` | Networks local preview |
| `12`–`22-*.png` | Messages · Calendar · Money · Payouts · Services · Clients · Profile · Reviews · Settings · Builder · Attention |
| `23-desk.png` | Honest Desk forbidden |
| `14c-money-owed.png` | Owed settled (not stuck Loading) |
| `27-questions.png` | Questions tile |
| `presence-probe.json` / `results.json` | Machine walk logs |
