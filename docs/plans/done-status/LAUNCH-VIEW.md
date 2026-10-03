# Launch view — what is in / out (2026-10-03)

For Oran. One page. Detail + flag matrix: [FEATURES.md](./FEATURES.md) · [VISIBILITY.md](./VISIBILITY.md) · Asks: [oran-batched-asks.md](../oran-batched-asks.md)

**Tips:** production pointer `7d30bb9d1` · `main` `1d56220d1` (#2501 Desk reuse merged, waiting CI → production pointer)

---

## Live and ready to launch

What a talent gets on **tulala.digital / app.tulala.digital** today:

- **Presence Studio v2** — tabs Mi sitio web / Dónde aparezco / Descubrir redes (paid + Free)
- **Today / Calendar (Agenda V2)** for all talents
- **Messages v5** path (Studio + env bake)
- **Free website + Free Builder** (Valeria / fresh Free)
- **Website settings** for all talents
- **Theme gallery** env ON (finished Maison / Folio / Gridline set; entry path being confirmed by sibling shots)
- **Talent subdomains** `*.tulala.digital`
- **Preview eye** → live site
- **Dashboard teal / Alba** visual tokens
- **Avatar menu** → Builder / Money / Messages / Settings
- **Legal refunds** EN + ES
- **Domain Buscar** honest Coming soon (registrar parked)
- **Client-pays / pass_through** commission arming (env + DB)
- **AI translate** + other `ai_*` settings ON
- Background: builder thumbnail + rollout cron, media private access, support-replay reap (confirm retention OK)

---

## Hidden but finished

### Turned on today / this wave (already verified ON — this audit did not re-flip)

| Item | Gate | Who |
|---|---|---|
| Talent Studio V2 | `TALENT_STUDIO_V2=1` | sibling Studio enable |
| Free website / gallery / website settings / subdomains / Messages v5 | reinforced plain envs | visibility + put-all-live siblings |
| Builder thumbnail + rollout cron | created `1` | visibility |
| Media private access env | created `1` (DB was true) | visibility |
| AI talent translate DB | `true` | visibility |
| Commission pass_through arming | plain `1` | put-all-live |
| Admin workspace FAB DB | `true` | put-all-live |
| Reap support replays | `true` | visibility (confirm in asks) |

**This agent (`bc-65f24c00`):** no additional env flips — all finished+safe gates already ON; verified against Vercel + Supabase. Did not touch Studio V2 / Desk / Maison / welcome email / consent.

### Waiting Oran’s decision (see batched asks)

| Item | Recommendation |
|---|---|
| `SUPPORT_DESK_ENABLED` | Wait until production pointer includes #2501, then Oran ON after Desk click-through |
| `CLIENT_WELCOME_EMAIL_ENABLED` | Keep OFF until SPF/DKIM + bounce suppressions |
| `TALENT_SITE_CONSENT_TOOLING_ENABLED` | Keep OFF — tooling unfinished; cookie bar redesign separate |
| Maison `TALENT_MAISON_THEME_ENABLED=all` | Keep cohort until owner audit |
| Card redesign Phase 2 | Show screenshots → yes/no ship |
| Reap support replays already ON | Confirm retention policy OK (or turn OFF) |
| Domain registrar buy | Stay parked |

---

## Not ready

| Item | Action |
|---|---|
| Front-door chat paid flip + `?order=` cold load | Finish + live prove (owed) |
| Messages Accept/Decline + net split E2E | Story 7 QA |
| Website settings → each setting changes live site | Story 2 |
| Bilingual ES+EN talent prove | Story / live |
| Paid money path (Connect + KYC + durable QA password) | Ops |
| AI booking assistant (S8) | Build later |
| ~32 themes / 224 demos | Build later (extra gallery flag stays off) |
| Premium app plan gate | Build later |
| Onboarding auto-publish + trade defaults | Build later |
| Site shell edit wide rollout | Stay default off |
| WhatsApp for all workspaces | Stay pilot list |

Hide dead buttons; do not advertise unfinished surfaces.

---

## Recommended launch scope

**Launch with:** Studio Presence, Agenda, Messages v5 UI, Free site/Builder, website settings, finished gallery set, subdomains, legal refunds, Coming-soon domains, fee rule code (with known money QA gaps).

**Keep hidden on purpose:** Support Desk host, client welcome email, consent tooling footer, Maison for everyone, registrar buy, WhatsApp outside pilot, site-shell edit, gallery extras (unfinished themes).

**Come later:** AI booker, theme/demo scale, premium apps, onboarding publish defaults, front-door chat owed fixes, full paid Connect walks.

**Engineering guardrail shipping:** PR `cursor/kill-feature-flag-dev-defaults-c337` — flags no longer default ON in `NODE_ENV=development`; static test prevents regression.
