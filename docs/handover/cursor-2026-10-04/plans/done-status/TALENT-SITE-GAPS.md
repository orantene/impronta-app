# `/talent/site` gaps — why “Live and ready” still feels unfinished

For Oran. Companion to [LAUNCH-VIEW.md](./LAUNCH-VIEW.md).

**Read this first:** LAUNCH-VIEW **“Live and ready to launch”** means *surfaces are gated ON and reachable on production* — **not** that every Mi sitio / gallery / settings / Apps / networks / messages path is product-complete. A row can be LIVE (you can open it) and still PARTIAL or broken for the job you expect.

| | |
|---|---|
| Live tip (production pointer) | **`1d56220d1`** · Vercel `dpl_HEY2zKKGzkKqScMy5M7BrqUtVptf` |
| `main` (ahead of tip) | `03bce10b0` (#2502 cookie — awaiting tip) |
| Walked | 2026-10-03 ~21:35–21:42Z · paid TAL-93900 + Free Valeria TAL-93901 + visitor hosts |
| Prior sweep | tip `7d30bb9d1` · [persona-visibility-sweep.md](../../../internal/persona-visibility-sweep.md) |
| Shots (this pass) | [media/talent-site-gaps/](../../../media/talent-site-gaps/) |
| Related | [FEATURES.md](./FEATURES.md) · [VISIBILITY.md](./VISIBILITY.md) · [oran-batched-asks.md](../oran-batched-asks.md) · [LAUNCH-EXECUTION.md](./LAUNCH-EXECUTION.md) · [theme-gallery-how-to.md](../theme-gallery-how-to.md) · [#2503 drawer](../talent-drawer-settings-icons.md) |

**Accounts:** `demo-jor-clone@impronta.test` (Oficina Web) · `qa-fresh-20260930@impronta.test` (Valeria Free / TAL-93901). Password from Cloud `QA_JOR_CLONE_PASSWORD` (trimmed). Never invent passwords.

---

## Status legend

| Status | Meaning |
|---|---|
| **LIVE** | Opened on tip; does the core job for that surface |
| **PARTIAL** | Reachable, but missing pieces Oran expects |
| **HIDDEN** | Finished or unfinished, kept off on purpose |
| **BROKEN** | Reachable but fails the job |
| **WAITING ORAN** | Needs an Oran decision (or Oran-only ops) before ship |

---

## Surface table (Presence / Mi sitio / Studio V2 / gallery / settings / drawer / messages)

| Surface | Status | What Oran should see | What he gets on tip `1d56220d1` | Exact unblock |
|---|---|---|---|---|
| Presence shell (`/talent/site` · Mi presencia) | **LIVE** | Three tabs + identity / manage-site bar | Paid + Free: tabs, plan chip, Administrar sitio / Sitio en vivo | — (already ON via `TALENT_STUDIO_V2=1`) |
| Tab **Mi sitio web** | **PARTIAL** | Live card, reliable preview, obvious design/settings chrome | Card + **En vivo** + Editar sitio + tiles; preview sometimes blank until load; chrome still emoji-only | Tip #2503 (labels); harden preview load if blank persists |
| Tab **Dónde aparezco** | **PARTIAL** | Listings + visits / requests per place | 1 ficha (Perfil Tulala) active; copy: *“Las visitas y solicitudes… aún no están disponibles”* | Product/data: visits+requests for listings (not a flag) |
| Tab **Descubrir redes** | **PARTIAL** | Joinable networks for all talents | Local preview: *“Estas redes aún no están activas para otros talentos”* | Product: activate networks beyond local QA view |
| Studio V2 identity bar / preview eye | **LIVE** | Bar + eye → public `*.tulala.digital` | Paid Administrar sitio + eye; Free Sitio en vivo pill | — |
| Theme gallery (**Cambiar diseño** → Elige un diseño) | **LIVE** *(improved)* | Finished Maison / Folio / Gridline grid with previews | Entry works; **previews load** on this tip (`jor-paid-05-gallery.png`, meta `loading:0`) — earlier sweep on `7d30bb9d1` saw hang | Keep P1.2 as regression guard if hang returns; not blocked on flag |
| Gallery scale (~32 themes / 224 demos) | **HIDDEN** | Large catalog | Only finished set (~4 slugs) | Build later; extra gallery flag stays off |
| Maison apply for everyone | **WAITING ORAN** | Free/fresh can apply Maison | Cohort `TALENT_MAISON_THEME_ENABLED=talents` + allow-list | Batched ask #4 — keep cohort or set `all` |
| Maison **actualización disponible** banner | **PARTIAL** | One-click upgrade that keeps content | Banner shows (Jor + Valeria); apply/undo not re-proved | Story 11 walk on TAL-93900 (#66/#67) |
| Edit chrome under Editar sitio (🎨 💧 ⏱) | **PARTIAL** | Labeled **Cambiar diseño / Colores / Historial** | Emoji-only squares; labels in aria only | **Tip PR [#2503](https://github.com/orantene/impronta-app/pull/2503)** (open, Structural) |
| Website settings (Ajustes / Ajustes del sitio) | **PARTIAL** | Full settings + each change hits live site; ideally drawer | Settings overlay opens (URL stays `/talent/site`); list complete; Story 2 “each setting → live” still 🟡 Live-proof owed | Tip #2503 sheet polish + Story 2 checklist ([LAUNCH-EXECUTION P1.3](./LAUNCH-EXECUTION.md)) |
| Dominio drawer | **PARTIAL** | Buy / connect / help | Connect + Get help LIVE; **Comprar = PRÓXIMAMENTE** | WAITING ORAN — registrar stay parked (ask #7) |
| Preguntas tile | **PARTIAL** | FAQ / questions for site | Tile present (red ?); depth not re-walked this pass | Spot-check + content seed if empty for new talents |
| Apps tile / library | **PARTIAL** | Trade suggestions + catalog | Library opens; Sugeridas empty for Jor; only **Diseñador de uñas** in Todas | Product: more apps + suggestions; premium gate later |
| Free website + Free Builder | **LIVE** | Free can publish + edit within Free locks | Valeria Plan GRATIS, public `valeria-unas.tulala.digital`, Presence same shape as paid | — (`TALENT_FREE_WEBSITE_ENABLED=true`) |
| Talent subdomains | **LIVE** | `*.tulala.digital` public | Jor + Valeria HTTP 200 | — |
| Public site cookie Accept/Decline | **LIVE** *(changed)* | Consent bar on talent hosts | Tip `1d56220d1`: **Rechazar / Aceptar** present on Jor + Valeria public (`visitor-*-cookie.json`) — was ❌ on tip `7d30bb9d1` | #2502 still awaiting tip for app dark-strip redesign; consent *tooling* footer stays OFF (ask #3) |
| Messages inbox (from site inquiries) | **PARTIAL** | Site guests → inbox; Accept/Decline + fee/net | Inbox LIVE with site-origin threads (QA Guest Story04*); Accept/Decline + net split not E2E | Story 7 QA (LAUNCH-VIEW Not ready) |
| Messages gear / tips drawer | **PARTIAL** | Fee tip + payout prefs in thread | Code LIVE; not opened this pass | Click-through Story 7 |
| Onboarding → published own URL | **BROKEN** / not ready | New talent ends on live `*.tulala.digital` | Register UI only; no auto-publish E2E | Product build (STATUS #2/#3) + fresh signup walk |
| Support Desk (not on `/talent/site`, but LAUNCH-VIEW claimed LIVE) | **BROKEN** for auth’d owners | Owner Desk portal | Unauth 307→login ≠ LIVE; logged-in soft **Page not found** | [#2505](https://github.com/orantene/impronta-app/pull/2505) → tip → admin prove — **do not call LIVE** |

---

## What LAUNCH-VIEW got right vs what Oran feels

LAUNCH-VIEW correctly lists Presence tabs, Free site, settings *entry*, gallery *flag*, Messages *inbox*, subdomains as **on**. Oran’s frustration is valid because:

1. **Chrome still looks unfinished** — unlabeled emoji under Editar sitio; gallery discoverability depends on that mystery palette (#2503 not on tip).
2. **Tabs advertise more than they deliver** — visits/requests and networks say “not available yet” in the UI itself.
3. **Apps looks empty** — one app, no trade suggestions for beauty/lash personas.
4. **“Settings are live” ≠ “every setting proven on the public site”** — Story 2 still owed for ✅.
5. **Launch snapshot ≠ Done board** — STATUS still has many 🟡/❌ rows for site-adjacent stories.

---

## Ordered ship plan — next 5 concrete actions

1. **Merge [#2503](https://github.com/orantene/impronta-app/pull/2503) → tip → Cloud Chrome prove** — labeled Cambiar diseño / Colores / Historial; Ajustes opens settings sheet; shots under `media/talent-drawer-icons/` + refresh `media/talent-site-gaps/`.
2. **Story 2 website-settings → live checklist (P1.3)** — walk Free + paid each setting row; fill [LAUNCH-EXECUTION](./LAUNCH-EXECUTION.md) table; open fix PRs only for bindings that fail.
3. **Promote tip past `03bce10b0` (#2502)** when Structural green — cookie light bar on app routes; re-smoke; keep `TALENT_SITE_CONSENT_TOOLING_ENABLED` OFF until tooling ready.
4. **Fresh signup → published URL** — one new `@impronta.test` talent through verify → onboarding → public subdomain (closes STATUS #2/#3 gap LAUNCH-VIEW already flags).
5. **Messages from site E2E (Story 7)** — open a site inquiry thread on TAL-93900; Accept/Decline + fee/net lines; file code fix PR only if UI/path fails (money still blocked on Connect/captcha separately).

*Not in the top 5 (parked / Oran):* Maison=`all`, registrar buy, ~32 themes, Desk soft-404 (owned by [#2505](https://github.com/orantene/impronta-app/pull/2505)), AI booker.

---

## Evidence index (this walk)

| Shot | Shows |
|---|---|
| `jor-paid-01-mi-sitio.png` / `valeria-free-01-mi-sitio.png` | Presence + Mi sitio |
| `jor-paid-02-donde-aparezco.png` | Visits/requests unavailable |
| `jor-paid-03-descubrir-redes.png` | Networks local-only |
| `jor-paid-05-gallery.png` | Gallery previews loaded |
| `jor-paid-06-website-settings.png` / `valeria-free-06-…` | Settings list |
| `jor-paid-07-domain.png` | Buy Coming soon |
| `jor-paid-08-apps.png` | Single app library |
| `jor-paid-09-messages.png` | Inbox with site guests |
| `visitor-*-public.png` + `*-cookie.json` | Public site + consent buttons |

Prior persona sweep (tip `7d30bb9d1`): [media/built-vs-live-audit/](../../../media/built-vs-live-audit/).
