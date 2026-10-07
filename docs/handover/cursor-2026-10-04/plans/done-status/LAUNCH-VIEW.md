# Launch view — what is in / out (2026-10-04)

For Oran. One page. Detail + flag matrix: [FEATURES.md](./FEATURES.md) · Full audit: [built-vs-live-audit.md](../../built-vs-live-audit.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md)

> **`/talent/site` is not “done.”** [TALENT-SITE-GAPS.md](./TALENT-SITE-GAPS.md) still maps Presence holes. **“Live and ready” below = gated ON and reachable**, not product-complete.

**Tips:** live HTML **`a717b208a`** (#2512 Maison smoke=`all` · alias lag cleared → `dpl_6C1BRo2w…`) · `origin/main` **`1e533011f`** (front-chat Structural chase).

**Daily line:** `Features: ~22 live / 6 hidden-on-purpose / 0 hidden-by-mistake (#2512 LIVE HTML a717; Maison expectation=all; Desk untouched). Smoke flags need CRON_SECRET. Tip 1e533 = front-chat.`

---

## Live prove (this wave)

Built-vs-Live re-prove 2026-10-04 ~01:07Z (TAL-93900): [media/built-vs-live/](../../../media/built-vs-live/) · [RESULT.md](../../../media/built-vs-live/RESULT.md)

**Dashboard fold** 2026-10-04 ~01:39Z (TAL-JORGBEAUTY, tip `339dec9b8`): [talent-dashboard-live-audit.md](../../talent-dashboard-live-audit.md) · [media/talent-dashboard-audit/](../../../media/talent-dashboard-audit/) — **no finished-but-hidden FAILs**; Oran-parked: domain Buy / visits / networks-beyond-local.

**#2512:** **LIVE HTML** `a717b208a` — production pointer + custom domains (`app`/`tulala.digital`) after alias fix. `prod-flag-expectations.mjs` Maison=`all`. Smoke: reachability/CSP/cron-auth PASS; flags probe still needs `CRON_SECRET` in agent env.

| | Count | Highlights |
|---|---|---|
| ✅ ON + visible | Studio Presence, Agenda, Messages, gallery, website settings, subdomains, public Maison, cookie bar, full talent rail, avatar TAL code, Desk honest admin gate |
| ⏸ Oran | Desk flag (already ON), welcome email, consent tooling, reap retention, card redesign, **domain Buy**, visits/requests, networks global |
| ❌ / owed | Fresh Free → published, front-door chat paid/`?order=` (sibling on `1e533`), captcha re-enable before Jorgelina; smoke **flags** row needs `CRON_SECRET` (other smoke PASS on a717 HTML) |

---

## Live and ready to launch

Gated **ON** on **tulala.digital / app.tulala.digital** today:

- **Presence Studio v2** — Mi sitio web / Dónde aparezco / Descubrir redes
- **Today / Calendar (Agenda V2)**
- **Messages v5** inbox
- **Free website + Free Builder**
- **Website settings** (Ajustes del sitio)
- **Theme gallery** + **Maison=`all`** (every talent; finished Maison/Folio/Gridline set)
- **Talent subdomains** `*.tulala.digital`
- **Preview eye / Editar sitio**
- **Dashboard teal / Alba** + account chrome
- **Legal refunds** EN + ES
- **Domain Buscar** Coming soon (honest)
- **Client-pays / pass_through** arming
- **AI translate** + other `ai_*` ON
- Background: builder thumbs + rollout cron, media private access, support-replay reap

---

## Hidden but finished

### Already ON (no flip this wave)

All finished+safe env gates verified ON via Vercel Production + LIVE shots. **No additional env creates.** Smoke matrix lag fixed in [#2512](https://github.com/orantene/impronta-app/pull/2512) (Maison expectation `talents` → `all`).

### Waiting Oran’s decision

| Item | Recommendation |
|---|---|
| `SUPPORT_DESK_ENABLED` | **Already `1`.** Do not flip. Admin portal only. |
| `CLIENT_WELCOME_EMAIL_ENABLED` | Keep OFF until SPF/DKIM + suppressions |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | Keep OFF — cookie UI live; tooling unfinished |
| Reap support replays (already ON) | Confirm retention OK |
| Card redesign Phase 2 | Screenshots → yes/no |
| Domain registrar buy | Stay parked |

~~Maison=`all`~~ — **already live**.

---

## Not ready

| Item | Action |
|---|---|
| Front-door chat paid flip + `?order=` | Finish + live prove |
| Brand-new talent signup → published URL | ❌ known P2.1 |
| `/talent/site` PARTIAL holes | [TALENT-SITE-GAPS.md](./TALENT-SITE-GAPS.md) |
| Guest captcha | DB OFF for QA; **re-enable before Jorgelina** |
| AI booking assistant (S8) | Later |
| ~32 themes / premium apps / onboarding auto-publish | Later |
| WhatsApp outside pilot / site-shell edit | Stay off |

---

## Recommended launch scope

**Launch with:** Studio Presence, Agenda, Messages v5 UI, Free site/Builder, website settings, finished gallery + Maison for all, subdomains, legal refunds, Coming-soon domains, fee rule code.

**Keep hidden on purpose:** welcome email, consent tooling footer, registrar buy, WhatsApp outside pilot, site-shell edit, unfinished gallery extras. Desk: flag ON but talent UX not a launch claim.

**Come later:** AI booker, theme scale, premium apps, onboarding publish defaults, front-door chat owed fixes.

**Engineering:** [#2504](https://github.com/orantene/impronta-app/pull/2504) NODE_ENV defaults dead · [#2507](https://github.com/orantene/impronta-app/pull/2507) flag health on tip · [#2512](https://github.com/orantene/impronta-app/pull/2512) smoke ↔ Maison=`all`.
