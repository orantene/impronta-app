# Maison demos ↔ Builder Lab (how to fix demos from the template)

For Oran. Short answer first, then the click-path.

**Access:** Yes for you (`orantene@gmail.com` is `super_admin`). Cloud agents: **no staff session** on production Builder Lab today.  
**Editor:** [Maison v2 in Builder Lab](https://app.tulala.digital/platform/admin/builder-lab/talent-designs/maison-v2/edit) on **`app.tulala.digital`**.  
**How demos get the template:** publish the design (“Publish and update demos”) → release moves to the **demos** channel → `applyToDemos` rebuilds every registry demo; or use **Rebuild demos** on the Designs page.

---

## 1. Access

| Question | Answer |
|---|---|
| Host | **`app.tulala.digital` only.** Platform HQ / Builder Lab is not on Impronta agency hosts. |
| Path | `/platform/admin/builder-lab/...` |
| Auth | Signed-in **`super_admin`** (`profiles.app_role = 'super_admin'`). Gate: `isPlatformAdmin` → otherwise `notFound()` (looks like a plain 404). |
| Can Oran open it? | **Yes.** Live DB: `orantene@gmail.com` is `super_admin`. Also `qa-platform-admin@impronta.test` / `dev-super-admin@impronta.test` (fixtures). |
| Can a cloud agent open it? | **Not today.** Unauthenticated probe of the edit URL returns **Page not found**. Prior LIVE audits: `QA_PLATFORM_ADMIN_PASSWORD` missing in the Cloud env; talent sessions also 404 the Lab. Agents can read code + DB; they cannot click Publish / Rebuild without a staff cookie or cron secret. |

### Production URLs

| Surface | URL |
|---|---|
| Builder Lab home | https://app.tulala.digital/platform/admin/builder-lab |
| Talent Template Factory | same page → toggle **Talent Template Factory** (not the Catalog playground) |
| Maison v2 template editor | https://app.tulala.digital/platform/admin/builder-lab/talent-designs/maison-v2/edit |
| With Alba + Rosé (recommended) | https://app.tulala.digital/platform/admin/builder-lab/talent-designs/maison-v2/edit?subject=TAL-93020&look=rose&lang=es |
| Designs / release manager + Rebuild demos | https://app.tulala.digital/platform/admin/builder-lab/themes |

Do not use `impronta.tulala.digital` or a raw `*.vercel.app` preview for this — Lab is platform-admin on the app host.

---

## 2. How demos relate to the template

### Source of truth

| Layer | What it is | Touches demos? |
|---|---|---|
| **Theme design draft** (Builder Lab talent editor) | Shell + home trees for design slug `maison-v2` | Only after publish |
| **Theme version + release** (`talent_theme_versions` / `talent_theme_releases`) | Published snapshot; channel ladder `draft → demos → optin → default` | Demos update on **demos** (and again when opening to talents / default) |
| **Demo registry** | Code list of who may be rebuilt | `DEMO_REGISTRY` in `web/src/lib/talent-site/demos/registry.ts` (Alba `TAL-93020` reference + `THEME_DEMOS` + extras) |
| **Per-talent published site** | Each demo’s `talent_sites` / pages | What visitors see on `{site_slug}.tulala.digital` |

Editing the template **does not** live-patch demos. Draft stays in the theme draft until you publish.

### Flow (edit → demos)

From product docs (`docs/factory/how-to-make-a-new-theme.md`) and code:

1. **Edit** `/platform/admin/builder-lab/talent-designs/maison-v2/edit` (Talent Template Factory → Edit design).
2. Click **Publish and update demos** / **Publicar y actualizar demos**  
   (`publish-design-button.tsx` → `actionPublishDesignAndUpdateDemos` → `publishAndUpdateDemos`).
3. That **publishes a new version**, creates a release, dry-runs, then **`changeChannel(..., "demos")`**, which calls **`applyToDemos`** in the theme-releases manager (`release-manager.server.ts` / `channel.ts`). Demos merge or full-reapply the design and republish. Talents are **not** opened until you later click **Open to talents**.
4. Optional / alternate: on **Designs** (`/platform/admin/builder-lab/themes`), use the **Rebuild demos** panel per design (`DemoRebuildPanel` → `rebuildDemos` in `demo-rebuild.server.ts`). That one-command path: guard → content fixture → design (newest released version, demos channel included) → publish → cache bust. CLI: `npm run demos:rebuild` (needs local/dev + `CRON_SECRET`; not the normal production click-path).

Registry anchors: Alba **`TAL-93020`** (reference, palette `rose`), Camila `TAL-93003`, Renata `TAL-93002`, plus Linh / Leo / Sofía / Marcus / Coleman and extras. Gallery / `THEME_DEMOS` share the same codes.

### Can Oran fix demos **only** by editing the template?

| Yes — template publish / rebuild is enough | No — needs fixture / seed / code, not just the Lab tree |
|---|---|
| Section order, shell/header/footer structure, shared layout blocks | Per-demo **hero facts** (`hero-facts.ts`), services, FAQ, bio |
| Design-level tokens / shared look applied via release | Per-demo **palette / style** (`THEME_DEMOS` + `MAISON_V2_DEMO_STYLES`) |
| Bugs that live in the authored design trees | **Photos / media assets** on the talent |
| Aligning demos that drifted off the released design version | **`site_slug` / public host name** (seeded; not rewritten by rebuild) |
| | Reference mockup strings from `design-references/maison-v2/content.json` (Alba fixture) when content is wrong |

**Rule of thumb:** structure and design chrome → edit template + publish/rebuild. Person-specific copy, media, slug, or “this demo’s look” → fixtures / registry / seed scripts.

### Live drift (why “update all demos” matters)

Production pins are **not** aligned today (Tulala Digital DB snapshot):

| Demo | `site_slug` | `theme_version` pin |
|---|---|---|
| Alba TAL-93020 | `alba-nail-artist` | 29 (odd vs max catalog version **23** — investigate if a pin looks wrong after rebuild) |
| Camila TAL-93003 | `camila-nails` | 18 |
| Renata TAL-93002 | `renata-lashes` | 20 |
| Andrés TAL-93006 (extra / keepLook) | `andres-cocina` | 14 |
| Linh…Coleman | `linh-tran` … `terrence-coleman` | 3–4 |

Open Maison v2 release still includes opt-in **22→23**. A careful **Publish and update demos** or **Rebuild demos** for `maison-v2` is the intended way to pull them forward.

---

## 3. Practical test plan (Oran click-path)

### A. Open Maison v2

1. Sign in as `orantene@gmail.com` on https://app.tulala.digital  
2. Open https://app.tulala.digital/platform/admin/builder-lab/talent-designs/maison-v2/edit?subject=TAL-93020&look=rose&lang=es  
   Or: Builder Lab → **Talent Template Factory** → Maison v2 → Edit design.

### B. Safe smoke change

Change **one tiny shared string** in a non-hero shell/footer or a clearly design-owned label (something every Maison demo inherits from the tree), not Alba-only fixture copy. Save in the builder (draft only until publish).

### C. Apply / rebuild demos

**Preferred for “I edited the template”:**

1. Click **Publish and update demos** (confirm dialog).  
2. You land on the **release** page under `/platform/admin/builder-lab/themes/<releaseId>`.  
3. Confirm demos applied; do **not** click **Open to talents** for a smoke unless you intend talents to see the update.

**If demos are already behind a published design and you only need re-apply:**

1. https://app.tulala.digital/platform/admin/builder-lab/themes  
2. On the **maison-v2** card → **Preview** (dry run) on Rebuild demos → then **Rebuild**.  
3. Restore is available per row if a write went wrong.

CLI `npm run demos:rebuild` is for agents/local with `CRON_SECRET` — not required for Oran’s smoke.

### D. Which demo URL to check

**Today (bare slug — live):**

- https://alba-nail-artist.tulala.digital ← primary check (TAL-93020)  
- Optional: https://camila-nails.tulala.digital · https://renata-lashes.tulala.digital  

Also: https://app.tulala.digital/t/TAL-93020  

**When `{slug}-demo` cutover is ready** (owner `bc-345dbdcf`; mapping appends `-demo` without renaming `site_slug`):

- https://alba-nail-artist-demo.tulala.digital  
- Bare hosts will **308 → `-demo`**.

As of this doc, `alba-nail-artist-demo.tulala.digital` still returns **Domain not connected** / unregistered — use **bare** hosts until that ships. Builder Lab URLs stay on **`app.tulala.digital`**; the `-demo` work only changes **public demo talent hosts**, not Lab paths.

---

## 4. Agent vs Oran-only

| Action | Agent | Oran |
|---|---|---|
| Read code / registry / SQL pins | Yes | Yes |
| Open Builder Lab UI on production | **No** (no `super_admin` session; password not in Cloud env) | **Yes** |
| Tiny draft edit + Publish and update demos | Oran-only (destructive to all demos on that design) | Yes — confirm dialog |
| Rebuild demos / restore run | Oran-only on prod UI | Yes |
| `npm run demos:rebuild --write` against prod | Avoid unless explicitly authorized + secrets present | Possible with care |
| Change passwords / create staff sessions | Never | Owner |
| Open release to talents / Make default | Oran-only | Yes — separate from demo smoke |

Agents stay **read-only** on the production DB for demo content; they should not click Rebuild or Publish without an explicit ask and a working staff path.

---

## Related

- Factory how-to: `docs/factory/how-to-make-a-new-theme.md` (repo)  
- Prior LIVE audits: [theme-release-and-fresh-signup.md](./theme-release-and-fresh-signup.md), [theme-release-chain-audit.md](./theme-release-chain-audit.md)  
- Demo host naming / `-demo` cutover: [internal/maison-demo-host-naming.md](../internal/maison-demo-host-naming.md), [internal/demo-host-suffix-evidence.md](../internal/demo-host-suffix-evidence.md)  
- Agent pulse: [internal/maison-demos-builder-lab-pulse.md](../internal/maison-demos-builder-lab-pulse.md)
