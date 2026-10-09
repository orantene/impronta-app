# L6 — Theme lifecycle error / limit catalogue (research)

**Ticket:** [TUL-424](https://app.notion.com/p/3f32c5ee974381c8a761c5ae59cb025b)  
**Scope:** Research only — every error/limit path with `file:line` and today's ES/EN text. **No copy or code changes.**  
**As of:** `origin/main` @ 2026-10-09  
**Paths:** under `web/src/` unless noted. Lines approximate to tip at research time.

**Sentry rule of thumb:** `logServerError()` → `Sentry.captureException` (`lib/server/safe-error.ts:42-56`). Expected refusals usually return `{ ok: false, error }` with no Sentry. Unexpected throws / DB failures on listed paths often call `logServerError` first.

**Locale gaps (cross-cutting):**
- Many ActionResult `error` strings are **EN-only**; UI shows them raw for ES users.
- Several APIs expose `errorEs` (publish-core, authored gate) but Builder Lab UI often displays `res.error` only (EN).
- Free-site plan refusal has EN+ES copy, but `saveGuardTreeCheck` does not pass locale → talents always get EN (`talent-update.server.ts:442-446`).
- Impersonation refusal is EN-only: `Exit 'viewing as' to make changes`.

---

## Catalogue

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| BL-G01 | Builder Lab publish/release | `app/(workspace)/platform/admin/builder-lab/themes/actions.ts:28` | No session | Not signed in. | — | EN-only gate |
| BL-G02 | Builder Lab publish/release | `…/themes/actions.ts:29` | Not platform admin | Super admin access required. | — | EN-only |
| BL-G03 | Builder Lab publish/release | `…/themes/actions.ts:43` | No service role client | Server configuration error. | — | EN-only |
| BL-G04 | Builder Lab publish/release | `…/themes/actions.ts:45` | Release id missing | Release not found. | — | EN-only |
| BL-G05 | Builder Lab publish/release | `…/themes/actions.ts:50-51` | Thrown in withRelease | `err.message` or Action failed. | — | **Sentry** via `logServerError("themeReleaseManager.action")` |
| BL-G06 | Builder Lab publish/release | `…/themes/actions.ts:65` | Save on archived | This release is archived. | — | EN-only |
| BL-G07 | Builder Lab publish/release | `…/themes/actions.ts:98` | Bad channel target | Unknown channel. | — | EN-only |
| BL-DR1 | Builder Lab publish/release | `lib/talent-site/theme-releases/manager/dry-run.ts:171` | Channel/resync without dry run | Run a dry run first. No channel change without a report. | — | EN-only; shown in release panel msg |
| BL-DR2 | Builder Lab publish/release | `…/dry-run.ts:174` | Dry run for other release | The dry run belongs to another release. Run it again. | — | EN-only |
| BL-DR3 | Builder Lab publish/release | `…/dry-run.ts:177` | Items edited after dry run | Items changed after the dry run. Run it again. | — | EN-only; UI also has bilingual `dryStale` label |
| BL-DR4 | Builder Lab publish/release | `…/dry-run.ts:192` / `channel.ts:103` | Archived release | This release is archived. | — | EN-only |
| BL-DR5 | Builder Lab publish/release | `…/dry-run.ts:194` / `channel.ts:104` | Paused release | This release is paused. Resume it first. | — | EN-only |
| BL-DR6 | Builder Lab publish/release | `…/dry-run.ts:197` | Skip channel step | Move one step at a time: {channel} to the next channel. | — | EN-only |
| BL-DR7 | Builder Lab publish/release | `…/dry-run.ts:202` / `channel.ts:109` | Dry run has site errors | {N} site(s) failed the dry run. Fix or rerun. | — | EN-only |
| BL-CH1 | Builder Lab publish/release | `…/manager/channel.ts:54` | Opt-in with rollout 0 | Set a rollout % above 0 before opening to talents. | — | EN-only |
| BL-CH2 | Builder Lab publish/release | `…/theme-catalog/authored-sync-rule.ts:63-66` | Opt-in/default while authored pending | This version was made in the template editor and the code does not include it yet. Commit its overlay and sync before opening it to talents or making it the default. | Esta versión se hizo en el editor de plantillas y el código aún no la incluye. Confirma su overlay y sincroniza antes de abrirla a talentos o hacerla predeterminada. | Has `errorEs`; release panel shows `res.error` (EN) only |
| BL-CH3 | Builder Lab publish/release | `…/manager/channel.ts:105` | Resync while still draft | Publish to demos first. | — | EN-only |
| BL-CH4 | Builder Lab publish/release | `…/manager/channel.ts:89` | Auto-improve site failures (warning) | Auto-improve {profileCode}: {msg} | — | Surfaced as warning string, not hard fail of channel |
| BL-RM1 | Builder Lab publish/release | `…/manager/release-manager.server.ts:160` | Dry run / apply: design missing | Design not found in the catalog. | — | EN-only; also flipCatalog path |
| BL-RM2 | Builder Lab publish/release | `…/release-manager.server.ts:189` | Persist dry report DB error | `{error.message}` (raw) | — | Raw DB; possible **Sentry** if thrown upstream |
| BL-RM3 | Builder Lab publish/release | `…/release-manager.server.ts:247` | Demo apply failures | failures joined with ` \| ` | — | Often `{code}: {reason}` from pin/write |
| BL-RM4 | Builder Lab publish/release | `…/release-manager.server.ts:366` | Pause/resume archived | This release is archived. | — | EN-only |
| BL-RM5 | Builder Lab publish/release | `…/release-manager.server.ts:373` | Pause persist DB error | `{error.message}` | — | Raw DB |
| BL-MS1 | Builder Lab publish/release | `…/manager/merge-site.server.ts:74` | Catalog version ≠ release target | Catalog is at v{X}, release targets v{Y}. | — | EN-only admin |
| BL-MS2 | Builder Lab publish/release | `…/merge-site.server.ts:94` | Site row missing | Site not found. / DB message | — | EN/raw |
| BL-MS3 | Builder Lab publish/release | `…/merge-site.server.ts:101` | Hydration tokens missing | Hydration tokens unavailable for {name}; refusing empty apply. | — | EN-only |
| BL-MS4 | Builder Lab publish/release | `…/merge-site.server.ts:111` | Target build failed | Target build failed: {errors} | — | EN-only |
| BL-MS5 | Builder Lab publish/release | `…/merge-site.server.ts:117` | Base build failed | Base build failed: {errors} | — | EN-only |
| BL-MS6 | Builder Lab publish/release | `…/merge-site.server.ts:183` | Pin guard on write | `{profileCode}: {pin.reason.en}` | pin has ES but throw uses EN | Pin reason bilingual in `pin-guard.ts`; write path uses `.en` |
| BL-FC1 | Builder Lab publish/release | `…/theme-releases/release-design.server.ts:49` | Make default would go backward | The catalog is already at v{X}; making v{Y} the default would move it backward. This release is superseded. | — | EN-only |
| BL-FC2 | Builder Lab publish/release | `…/release-design.server.ts:148` | Flip: design missing | Design not found in the catalog. | — | EN-only |
| BL-FC3 | Builder Lab publish/release | `…/release-design.server.ts:153` | No snapshot for to_version | No snapshot for v{N}; run the catalog sync first. | — | EN-only |
| BL-FC4 | Builder Lab publish/release | `…/release-design.server.ts:155` | Invalid snapshot payload | v{N} payload is invalid: {errors} | — | EN-only |
| BL-UI1 | Builder Lab publish/release | `…/builder-lab/themes/copy.ts:57` / `:143` | UI label: no dry run yet | No dry run yet. Run one before any channel change. | Aún no hay prueba. Ejecuta una antes de cambiar de canal. | Informational / soft limit, not ActionResult |
| BL-UI2 | Builder Lab publish/release | `…/themes/copy.ts:58` / `:143` | UI label: stale dry run | Items changed since this report. Run it again. | Los elementos cambiaron desde este informe. Ejecútalo de nuevo. | Bilingual chrome |
| BL-UI3 | Builder Lab publish/release | `…/themes/copy.ts:89` / `:175` | Cache bust warning after channel | Warning, page cache not cleared | Aviso, no se limpió la caché de la página | Warning, not hard error |
| BL-UI4 | Builder Lab publish/release | `…/themes/copy.ts:49` / `:135` | Items missing EN/ES notes | items still need an EN and ES note | elementos aún necesitan nota en EN y ES | Soft validation before save |
| BL-PG1 | Builder Lab publish/release (pin) | `lib/talent-site/theme-releases/pin-guard.ts:80-81` | Pin real site to unreleased version | Version {N} of this design has not been released yet, so a live site cannot be set to it. | La versión {N} de este diseño aún no se ha publicado, así que un sitio en vivo no puede usarla. | Used by apply/history/demo write paths |
| TF-G01 | Builder Lab publish (template factory) | `…/talent-designs/publish-actions.ts:32-33` | Gate | Not signed in. / Super admin access required. | — | EN-only |
| TF-G02 | Builder Lab publish (template factory) | `…/publish-actions.ts:53` | No admin client | Server configuration error. | — | EN-only; **Sentry** on catch `themeTemplate.publishAction` |
| TF-G03 | Builder Lab publish (template factory) | `…/publish-actions.ts:58` | Thrown | `err.message` / Action failed. | — | **Sentry** |
| TF-G04 | Builder Lab publish (template factory) | `…/publish-actions.ts:66` | Bad slug | Unknown design. | — | EN-only |
| TF-G05 | Builder Lab publish (template factory) | `…/publish-actions.ts:80` | Bad slug/rev | Unknown design or draft revision. | — | EN-only |
| TF-P01 | Builder Lab publish (template factory) | `…/theme-template/publish-core.ts:335` | Draft already closed | This draft is already closed. Reopen the design. | Este borrador ya está cerrado. Vuelve a abrir el diseño. | Bilingual `error`/`errorEs` |
| TF-P02 | Builder Lab publish (template factory) | `…/publish-core.ts:338-342` | Stale draft rev (plan) | The draft changed in another tab. Reload before publishing. | El borrador cambió en otra pestaña. Recarga antes de publicar. | Also RPC map `:483` |
| TF-P03 | Builder Lab publish (template factory) | `…/publish-core.ts:347` | Design missing | Design not found in the catalog. | El diseño no está en el catálogo. | Bilingual |
| TF-P04 | Builder Lab publish (template factory) | `…/publish-core.ts:354-358` | Preflight issues | The design has {N} problem(s) to fix before publishing. | El diseño tiene {N} problema(s) que corregir antes de publicar. | Plus EN-only `issues[]` detail lines |
| TF-P05 | Builder Lab publish (template factory) | `…/publish-core.ts:168` | Issue detail | {tree}{path}: "{kind}" is not allowed in a design. | — | EN-only issue line |
| TF-P06 | Builder Lab publish (template factory) | `…/publish-core.ts:173` | Issue detail | {tree}{path}: unknown placeholder {{name}}. | — | EN-only issue line |
| TF-P07 | Builder Lab publish (template factory) | `…/publish-core.ts:207-209` | Issue detail | {tree}:{key}: "{prop}" changed but its Spanish text is missing/did not. | — | EN-only issue line |
| TF-P08 | Builder Lab publish (template factory) | `…/publish-core.ts:363-366` | Base moved under editor | The design moved to v{N} while you edited. Reopen it to continue. | El diseño pasó a la v{N} mientras editabas. Vuelve a abrirlo para seguir. | Bilingual |
| TF-P09 | Builder Lab publish (template factory) | `…/publish-core.ts:372-375` | Code claims next version | v{N} is already reserved by a release written in code. Ship that release first. | La v{N} ya está reservada por una versión escrita en código. Publica esa versión primero. | Bilingual |
| TF-P10 | Builder Lab publish (template factory) | `…/publish-core.ts:386-393` | Empty / content-only diff | No changes to publish. / No changes for existing sites… | No hay cambios que publicar. / No hay cambios para los sitios existentes… | Bilingual |
| TF-P11 | Builder Lab publish (template factory) | `…/publish-core.ts:471` | RPC transport error | Publish failed: {message}. | No se pudo publicar: {message}. | May include raw DB text |
| TF-P12 | Builder Lab publish (template factory) | `…/publish-core.ts:473` | Empty RPC | Publish failed: empty answer from the database. | No se pudo publicar: la base de datos no respondió. | Bilingual |
| TF-P13 | Builder Lab publish (template factory) | `…/publish-core.ts:478` | Incomplete RPC | Publish failed: the answer had no version or release. | No se pudo publicar: la respuesta no trajo versión ni entrega. | Bilingual |
| TF-P14 | Builder Lab publish (template factory) | `…/publish-core.ts:486-489` | Concurrent publish | Someone published this design meanwhile. Reopen it to continue. | Alguien publicó este diseño mientras tanto. Vuelve a abrirlo para seguir. | Bilingual |
| TF-P15 | Builder Lab publish (template factory) | `…/publish.server.ts:83` | No open draft (loadDraft) | No open draft for this design. (from drafts) | No hay un borrador abierto para este diseño. | ES only for `not_found`; other draft codes get EN as errorEs |
| TF-P16 | Builder Lab publish (template factory) | `…/theme-template/drafts.server.ts:29` | Draft save CAS | The draft changed since it was loaded. | — | EN-only STALE (editor path) |
| TF-P17 | Builder Lab publish (template factory) | `…/publish.server.ts:98` | Caught throw | Publish failed: {msg}. | No se pudo publicar: {msg}. | **Sentry** `themeTemplate.publish` |
| TF-P18 | Builder Lab publish + demos | `…/publish.server.ts:158` | Release missing after publish | Published, but the release was not found. | Publicado, pero no se encontró la entrega. | Partial success |
| TF-P19 | Builder Lab publish + demos | `…/publish.server.ts:162` | Dry run failed after publish | Published, but the dry run failed: {error} | Publicado, pero la prueba falló: {error} | Nested EN error |
| TF-P20 | Builder Lab publish + demos | `…/publish.server.ts:169-170` | Dry run site errors | Published, but {N} site(s) failed the dry run. Demos were not updated. | Publicado, pero {N} sitio(s) fallaron en la prueba. Los demos no se actualizaron. | Bilingual |
| TF-P21 | Builder Lab publish + demos | `…/publish.server.ts:185-186` | Channel demos failed | Published, but demos were not updated: {moved.error} | Publicado, pero los demos no se actualizaron: {moved.error} | Nested EN |
| TF-UI1 | Builder Lab publish (template factory) | `components/builder-lab/talent-factory/publish-design-button.tsx:20` / `:27` | Any fail | Could not publish: {e} | No se pudo publicar: {e} | Wrapper bilingual; **inner `{e}` is always `res.error` (EN)** — ignores `errorEs` |
| TF-UI2 | Builder Lab publish (template factory) | `…/publish-design-button.tsx:42` | Missing CAS rev | Could not publish: draft revision unknown | No se pudo publicar: draft revision unknown | Inner phrase EN-only |
| DR-T01 | Builder Lab demo rebuild | `…/themes/demo-rebuild-copy.ts:9` / `:54` | Client timeout >30s | This is taking too long (over 30 seconds). Nothing was published. | Esto tarda demasiado (más de 30 segundos). No se publicó nada. | Bilingual chrome |
| DR-T02 | Builder Lab demo rebuild | `…/demo-rebuild-copy.ts:46` / `:91` | Fallback | Something went wrong. Nothing was published. | Algo salió mal. No se publicó nada. | Bilingual |
| DR-A01 | Builder Lab demo rebuild | `…/themes/demo-rebuild-actions.ts:20-21` | Gate | Not signed in. / Super admin… | — | EN-only |
| DR-A02 | Builder Lab demo rebuild | `…/demo-rebuild-actions.ts:32` | Bad design | Unknown design. | — | EN-only |
| DR-A03 | Builder Lab demo rebuild | `…/demo-rebuild-actions.ts:41` | Thrown | `err.message` / Action failed. | — | **Sentry** `demoRebuild.action` |
| DR-A04 | Builder Lab demo rebuild | `…/demo-rebuild-actions.ts:54-59` | Restore fail | Restore failed. / `err.message` | — | **Sentry** `demoRebuild.restore` |
| DR-ST1 | Builder Lab demo rebuild | `…/demo-rebuild-copy.ts:33-34` | Per-demo status | Refused / Failed | Rechazado / Falló | Status labels; per-row `r.error` may be raw EN |

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| UN-C01 | Update notice | `lib/talent-site/theme-releases/talent-update/copy.ts:16` | Pill label | Update available | Actualización disponible | Not an error; chrome |
| UN-C02 | Update notice | `…/copy.ts:61` | Generic UI fail fallback | Something went wrong. Try again. | Algo salió mal. Inténtalo de nuevo. | Used when action omits error |
| UN-C03 | Update notice | `…/copy.ts:93-101` | Banner titles | {design} has an update / …available again | …tiene una actualización / …disponible de nuevo | Informational |
| UN-C04 | Update notice | `…/copy.ts:105-113` | Success toast after apply | Update applied to your draft · we kept N… | Actualización aplicada a tu borrador · conservamos N… | Success, not error |
| UN-N01 | Update notice (bell) | `…/manager/notify.ts:53-58` | Fan-out notification | {design} has an update / See what is new… | {design} tiene una actualización / Mira qué hay… | Bilingual by talent locale |
| UN-A01 | Update notice / apply | `…/talent-update-actions.ts:34` | Bad UUID | Unknown update. | — | EN-only |
| UN-A02 | Update notice / apply | `…/talent-update-actions.ts:35` | No service client | Not configured. | — | EN-only |
| UN-A03 | Update notice / apply | `…/talent-update-actions.ts:67` etc. | Impersonation | Exit 'viewing as' to make changes | — | EN-only (`write-policy.ts:7-8`) |
| UN-A04 | Update notice / apply | gate via `site-action-gate.ts` | Plan / auth fail | (see PS-* / gate) | partial | Surfaces as `res.error` on notice |
| UN-S01 | Apply theme update | `…/talent-update.server.ts:473` | Notice gone | This update is no longer available. | — | EN-only |
| UN-S02 | Apply theme update | `…/talent-update.server.ts:506` | Merge fail on preview | `m.error` (merge messages) | — | Often EN admin-style merge errors |
| UN-S03 | Apply theme update | `…/talent-update.server.ts:596` | Already applied | This update is already in your draft. | — | EN-only |
| UN-S04 | Apply theme update | `…/talent-update.server.ts:600` | noBase site tries Apply | Your site is older than this version. You can add the new blocks. | — | EN-only action; UI has bilingual `UPDATE_COPY.noBase` |
| UN-S05 | Apply theme update | `…/talent-update.server.ts:601` | No home page | Home page not found. | — | EN-only |
| UN-S06 | Apply theme update | `…/talent-update.server.ts:604` + `free-site-tree-guard.ts:125-127` | Free plan structural grow | Available on Web Office. Your free website can edit and hide what it already has. | Disponible en Oficina Web. Tu sitio gratuito puede editar y ocultar lo que ya tiene. | **Gap:** TreeCheck omits locale → always EN |
| UN-S07 | Apply theme update | `…/talent-update.server.ts:668` | Dismiss save fail | Could not save. | — | EN-only |
| UN-S08 | Apply theme update | writer conflict → actions | Concurrent draft write | Updated in another tab · Reload | Actualizado en otra pestaña · Recargar | Localized only for `VERSION_CONFLICT` via `pick(CONFLICT_COPY)` |
| UN-S09 | Apply theme update | writer / apply fail | Generic draft write | Could not save your draft. / Site not found. / Page not found. | — | Mostly EN; conflict localized |
| UN-B01 | Apply theme update (add block) | `…/talent-update.server.ts:686` | Unknown item | That block is not part of this update. | — | EN-only |
| UN-B02 | Apply theme update (add block) | `…/talent-update.server.ts:695` | Already on page | This block is already on your page. | — | EN-only |
| UN-CF1 | Apply theme update (critical fix) | `…/critical-fix.server.ts:22` | Missing update | This update is no longer available. | — | EN-only |
| UN-CF2 | Apply theme update (critical fix) | `…/critical-fix.server.ts:25` | Has base (wrong path) | Your site can take the whole update. | — | EN-only |
| UN-CF3 | Apply theme update (critical fix) | `…/critical-fix.server.ts:26` | Nothing critical | There is nothing to fix. | — | EN-only |
| US-C01 | Update sheet | `…/talent-update/copy.ts:28-30` | noBase panel copy | Your site is older than this version: you can add the new blocks. | Tu sitio es anterior a esta versión: puedes agregar los bloques nuevos. | Informational limit |
| US-C02 | Update sheet | `ThemeUpdateSheet.tsx:74` / `:212` | Preview load fail | Something went wrong. Try again. | Algo salió mal… | Uses `UPDATE_COPY.failed` |
| US-C03 | Update sheet | `ThemeUpdateSheet.tsx:266` | Add block fail | `res.error` or failed fallback | fallback ES; raw error often EN | Gap when server returns EN |

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| PS-R01 | Publish site | `…/maison-publish-readiness.ts:46` | No site slug | Your site needs an address before publishing. | Tu sitio necesita una dirección antes de publicar. | Blocker |
| PS-R02 | Publish site | `…/maison-publish-readiness.ts:48-49` | Slug taken | The address {slug}.tulala.digital is already taken… | La dirección {slug}.tulala.digital ya está en uso… | Blocker |
| PS-R03 | Publish site | `…/maison-publish-readiness.ts:51` | No design | Apply a design before publishing. | Aplica un diseño antes de publicar. | Blocker |
| PS-R04 | Publish site | `…/maison-pending-apply.ts:109` | Readiness fail at publish | first blocker message / Fix the items below before publishing. | (blocker locale if passed) | Fallback EN |
| PS-A01 | Publish site | `…/site-management-actions.ts:592+` | Not configured / provision | Not configured. / provision error | — | EN-only |
| PS-A02 | Publish site | `…/site-management-actions.ts:607` | Pre-read fail | Could not read your site. | — | **Sentry** `maxSiteManager.publish.readPre` |
| PS-A03 | Publish site | `…/site-management-actions.ts:609` | Missing site | Site not found. | — | EN-only |
| PS-A04 | Publish site | `…/site-management-actions.ts:648` | Page body publish fail | Could not publish your pages. (pages) | — | **Sentry** `maxSiteManager.publish.pages` |
| PS-A05 | Publish site | `…/site-management-actions.ts:675` | Site row publish fail | Could not publish your site. ({code}) | — | **Sentry** `maxSiteManager.publish.site` |
| PS-A06 | Publish site | `…/site-management-actions.ts:690` | Theme publish hook fail | Your pages are live, but the theme could not be published. Try again. (theme) | — | Partial success |
| PS-UI1 | Publish site | `maison-setup-copy.ts:84` | Review UI fallback | Could not publish. Try again. | No se pudo publicar. Inténtalo de nuevo. | When UI maps generic; Review often shows raw `res.error` |
| PS-MP1 | Publish site (pending materialize) | `…/maison-pending-apply.ts:147` | Design missing | Maison design not found. | — | EN-only |
| PS-MP2 | Publish site (pending materialize) | `…/maison-pending-apply.ts:180` | Custom colors | Could not apply custom colors. | — | **Sentry** on write |
| PS-MP3 | Publish site (pending materialize) | `…/maison-pending-apply.ts:223` | Palette missing | Maison palette not found. | — | EN-only |
| PS-TH1 | Publish site (theme chrome) | `…/theme-apply-core.ts:403` | Theme publish read fail | Could not publish the theme. | — | **Sentry** |
| PS-TH2 | Publish site (theme chrome) | `…/theme-apply-core.ts:434` | Theme CAS conflict | The theme changed in another tab. Reload and try again. | — | EN-only |
| PS-G01 | Publish site | `site-action-gate.ts:44` | Flags-off Max gate | Upgrade to Max to build and manage your website. | — | EN-only legacy |
| PS-G02 | Publish site | `talent-self-guard.ts` via gate | Capability denied | Extra pages… / Adding sections… / You cannot edit… (tier-labeled) | Matching ES strings | When free-website flag on |

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| TS-G01 | Theme switch | `theme-gallery-i18n.ts:34` / `:76` | tier_required mapped | This theme needs Web Office. | Este tema requiere Web Office. | ManagerThemeGallery maps codes → copy (does not show raw EN) |
| TS-G02 | Theme switch | `theme-gallery-i18n.ts:35` / `:77` | theme_not_found | This theme is no longer available. | Este tema ya no está disponible. | |
| TS-G03 | Theme switch | `theme-gallery-i18n.ts:36` / `:78` | conflict | Your site changed in another tab. Reload and try again. | Tu sitio cambió en otra pestaña… | |
| TS-G04 | Theme switch | `theme-gallery-i18n.ts:37` / `:79` | feature_disabled | Themes are not available yet. | Los temas aún no están disponibles. | |
| TS-G05 | Theme switch | `theme-gallery-i18n.ts:38` / `:80` | other codes | Something went wrong. Try again. | Algo salió mal. Intenta de nuevo. | |
| TS-G06 | Theme switch | `theme-gallery-i18n.ts:51` / `:93` | Apply ok, publish now fail | The design was changed in your draft, but publishing failed. Try Publish site. | El diseño se cambió en tu borrador, pero no se pudo publicar… | |
| TS-G07 | Theme switch | `theme-gallery-i18n.ts:19` / `:61` | Gallery load fail | We could not load the theme gallery. | No pudimos cargar la galería de temas. | |
| TS-G08 | Theme switch | `theme-gallery-i18n.ts:23` / `:65` | Preview iframe fail | The preview could not load. | No se pudo cargar la vista previa. | |
| TS-A01 | Theme switch | `theme-actions.ts:46` | Feature flag off | Themes are not available yet. | — | EN; UI remaps via TS-G04 |
| TS-A02 | Theme switch | `theme-actions.ts:61` | Bad slug | Unknown theme. | — | remapped to generic |
| TS-A03 | Theme switch | `theme-actions.ts:64` | Missing catalog row | Theme not found. | — | → TS-G02 |
| TS-A04 | Theme switch | `theme-actions.ts:66` | Locked design | Upgrade to use this theme. | — | → TS-G01 (Web Office copy) |
| TS-A05 | Theme switch | `theme-apply-core.ts:240` | Invalid design payload | That design is not available. | — | **Sentry** invalidDesign |
| TS-A06 | Theme switch | `theme-apply-core.ts:250` | Pin guard | pin.reason.en | pin.reason.es exists unused | **Gap:** apply uses EN only |
| TS-A07 | Theme switch | `theme-apply-core.ts:263` | Hydration missing | Could not load this talent's profile content. Try again in a moment. | — | **Sentry** |
| TS-A08 | Theme switch | `theme-apply-core.ts:272` | Tree build fail | Could not build that design. | — | **Sentry** |
| TS-A09 | Theme switch | `theme-apply-core.ts:313` | Write fail | Could not apply the design. | — | **Sentry** |
| TS-A10 | Theme switch | `theme-apply-core.ts:338` | Invalid look | That look is not available. | — | **Sentry** |
| TS-A11 | Theme switch | `theme-apply-core.ts:348` | Look apply fail | Could not apply the look. | — | **Sentry** |
| TS-M01 | Theme switch (Maison) | `maison-apply-actions.ts:83` | Flag off | Maison is not available yet. | — | EN; shown raw in ThemeDetailScreen |
| TS-M02 | Theme switch (Maison) | `maison-apply-actions.ts:90` | Unknown design | Unknown design. | — | EN-only |
| TS-M03 | Theme switch (Maison) | `maison-apply-actions.ts:123` | Unknown palette | Unknown palette. | — | EN-only |
| TS-M04 | Theme switch (Maison) | `maison-apply-actions.ts:152` | Read fail | Could not read your site. | — | EN-only |
| TS-M05 | Theme switch (Maison) | `maison-apply-actions.ts:200` | Pending color save | Could not save the color change. | — | EN-only |
| TS-M06 | Theme switch (Maison) | `maison-apply-actions.ts:218` | Design missing | Maison design not found. | — | EN-only |
| TS-M07 | Theme switch (Maison) | `maison-apply-actions.ts:246` | Custom colors | Could not apply custom colors. | — | EN-only |
| TS-M08 | Theme switch (Maison) | `maison-apply-actions.ts:322` | Undo meta fail | Design applied, but Undo could not be saved. | — | Partial |
| TS-M09 | Theme switch (Maison) | `maison-apply-actions.ts:386` | Wrong undo path | Use Discard in Design options to drop unpublished live changes. | — | EN-only |
| TS-M10 | Theme switch (Maison) | `maison-setup-copy.ts:97-98` | Preview fail | The preview didn't load / Your choices are saved. Try again. | La vista previa no cargó / Tus elecciones están guardadas… | Bilingual |
| TS-M11 | Theme switch (Maison) | `DesignOptionsPanel.tsx:86` | Options action fail fallback | Something went wrong. | — | EN fallback if no res.error |

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| IM-A01 | Import from demo | `maison-import-actions.ts:53` | Flag off | Maison is not available yet. | — | EN-only; shown raw |
| IM-A02 | Import from demo | `maison-import-actions.ts:56` | No admin | Not configured. | — | EN-only |
| IM-A03 | Import from demo | `maison-import-actions.ts:80` | Unknown design | Unknown design. | — | EN-only |
| IM-A04 | Import from demo | `maison-import-actions.ts:85` | No catalog for demo | No importable content for this demo. | — | EN-only |
| IM-A05 | Import from demo | `maison-import-actions.ts:118` | Bad selection shape | Invalid selection. | — | EN-only |
| IM-A06 | Import from demo | `maison-import-actions.ts:121` | Empty selection | Select something to import. | — | EN-only |
| IM-A07 | Import from demo | `maison-import-actions.ts:171` | Undo missing id | Missing import. | — | EN-only |
| IM-C01 | Import from demo | `maison-import-core.ts:211` | Batch insert fail | Could not start the import. | — | EN-only |
| IM-C02 | Import from demo | `maison-import-core.ts:148` | Offering insert | `{error.message}` / insert failed | — | **Raw DB** possible |
| IM-C03 | Import from demo | `maison-import-core.ts:341` | Undo load fail | Could not load the import. | — | EN-only |
| IM-C04 | Import from demo | `maison-import-core.ts:343` | Batch missing | Import not found. | — | EN-only |
| IM-C05 | Import from demo | `maison-import-core.ts:454` | Retry bad catalog | Unknown starter catalog for this import. | — | EN-only |
| IM-C06 | Import from demo | `maison-import-core.ts:456` | Retry bad key | Unknown starter item. | — | EN-only |
| IM-UI1 | Import from demo | `ImportStarterPanel.tsx` + `maison-setup-copy.ts:85` | Partial fail retry label | Try again | Intentar de nuevo | Failed item shows `f.error` (often EN/raw) |
| IM-UI2 | Import from demo | `maison-setup-copy.ts:54` | Incomplete feature note | Import opens in a later step. | La importación llega en un paso posterior. | Soft incomplete-state copy (still present) |
| IM-RO1 | Import from demo | impersonation | Staff viewing as | Exit 'viewing as' to make changes | — | EN-only |

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| HR-C01 | History restore | `history/copy.ts:20-22` | Conflict notice | Updated in another tab · Reload | Actualizado en otra pestaña · Recargar | Bilingual |
| HR-C02 | History restore | `history/copy.ts:122-125` | Confirm copy | Restore this version to your draft?… | ¿Restaurar esta versión en tu borrador?… | Confirm, not error |
| HR-C03 | History restore | `history/copy.ts:127-129` | Undo update confirm | Undo only this design update?… | ¿Deshacer solo esta actualización…? | Confirm |
| HR-A01 | History restore | `history-actions.ts:51` | No admin | Not configured. | — | EN-only |
| HR-A02 | History restore | `history-actions.ts:60` | Bad entry id | Unknown version. | — | EN-only |
| HR-A03 | History restore | `history-actions.ts:80` | Bad undo id | Unknown update. | — | EN-only |
| HR-S01 | History restore | `history.server.ts:175` | Timeline load fail | Failed to load history | — | EN-only; **Sentry** on site/timeline errors |
| HR-S02 | History restore | `history.server.ts:178` | No site | Personal site not found. | — | EN-only |
| HR-S03 | History restore | `history.server.ts:251` | Snapshot gone | That version is no longer available. | — | EN-only |
| HR-S04 | History restore | `history.server.ts:254` | No draft state | Site not found. | — | EN-only |
| HR-S05 | History restore | `history.server.ts:277` | Free-site refuse restore | Available on Web Office… (EN via no locale) | ES exists unused | Same TreeCheck locale gap |
| HR-S06 | History restore | `history.server.ts:320` | Undo non-update entry | This entry cannot be undone. | — | EN-only |
| HR-S07 | History restore | `history.server.ts:413` | Pin refuse on undo write | pin.reason.en | ES unused | Gap |
| HR-W01 | History restore | `history/writer.ts:111` | Page missing | Page not found. | — | EN-only |
| HR-W02 | History restore | `history/writer.ts:142` | Generic write fail | Could not save your draft. | — | EN-only |
| HR-UI1 | History restore | `components/edit-chrome/talent-history-list.tsx:89-90` | Any restore/undo fail | shows `res.error` + `reportMutationError` | — | Toast/report; no Sentry unless reportMutationError wires it |
| HR-M01 | History restore (Maison previous design) | `DesignOptionsPanel` / maison restore actions | Restore previous design fail | `res.error` or Something went wrong. | soft bilingual chrome around it | Same EN action errors as theme switch |

---

## Shared gate / auth strings (touched by multiple flows)

| ID | Flow | file:line | Trigger | EN | ES | Notes |
|---|---|---|---|---|---|---|
| GATE-01 | * | `impersonation/write-policy.ts:7-8` | Impersonating | Exit 'viewing as' to make changes | — | EN-only |
| GATE-02 | * | `site-action-gate.ts:44` | Free website flag off | Upgrade to Max to build and manage your website. | — | EN-only |
| GATE-03 | * | `talent-self-guard.ts` SITE_DENIED_COPY | Capability deny (flag on) | tier-templated EN | tier-templated ES | Used when locale passed |
| GATE-04 | * | `requireTalentSelf` | No talent profile | Talent profile not found. | — | EN-only |

---

## Gap summary (no copy recommendations beyond gaps)

1. **EN-only ActionResults** dominate Builder Lab channel/dry-run/demo-merge and most talent theme-update/apply/import failures.
2. **`errorEs` unused in UI:** template publish button and release channel panel prefer `res.error`.
3. **Pin guard / free-site tree** have ES strings but call sites often pass EN only / omit locale.
4. **Raw DB / `err.message`** can surface on: merge failures, demo rebuild, publish RPC, import insert, pause persist.
5. **Sentry** is involved when paths call `logServerError` (unexpected), not on ordinary `{ ok: false }` refusals.
6. **Import from demo** is implemented (not stub-only); still has EN-only action errors and incomplete-step chrome (`Import opens in a later step.`).

---

## Key source files

- Builder Lab: `app/(workspace)/platform/admin/builder-lab/themes/{actions,copy,demo-rebuild-*}.ts(x)`, `talent-designs/publish-actions.ts`, `components/builder-lab/talent-factory/publish-design-button.tsx`
- Release engine: `lib/talent-site/theme-releases/manager/{dry-run,channel,release-manager.server,merge-site.server}.ts`, `release-design.server.ts`, `pin-guard.ts`, `authored-sync-rule.ts`
- Template publish: `lib/talent-site/theme-template/{publish-core,publish.server,drafts.server}.ts`
- Talent update: `lib/talent-site/theme-releases/talent-update/{copy,talent-update.server,talent-update-actions,critical-fix.server}.ts`, `components/talent/site/theme-update/*`
- Publish site: `site-management-actions.ts`, `maison-publish-readiness.ts`, `maison-pending-apply.ts`, `theme-apply-core.ts`
- Theme switch: `theme-actions.ts`, `theme-apply-core.ts`, `maison-apply-actions.ts`, `theme-gallery-i18n.ts`
- Import: `maison-import-actions.ts`, `maison-import-core.ts`, `ImportStarterPanel.tsx`
- History: `history/{copy,history.server,history-actions,writer}.ts`, `talent-history-list.tsx`

---

## Out of this PR

- Rewriting copy to plain language / filling missing ES
- Adding a test per message
- Any production or UI changes
