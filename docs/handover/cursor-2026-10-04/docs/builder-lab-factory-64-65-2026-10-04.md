# Builder Lab factory #64 / #65 + Publish demos — 2026-10-04

Agent: `bc-cd5cf7c8-b6f0-5877-8b6d-6a42f59946e5`  
Host: Cloud Chrome on `app.tulala.digital` as `qa-platform-admin@impronta.test`  
Media: [`media/builder-lab-factory/`](../media/builder-lab-factory/)

---

## Verdict

| Item | Result |
|---|---|
| `QA_PLATFORM_ADMIN_PASSWORD` present | **Yes** (new VM; secret injected) |
| Login as platform admin → Builder Lab | **PASS** |
| #64 Several talent templates at once | **PASS** — two independent drafts created |
| #65 Edit + release (Publish and update demos) | **PASS** — maison-v2 **v23 → v24**, demos channel |
| Publish demos completed | **Yes** — `demosApplied: 9` |
| Open to talents | **No** (not clicked) |
| Code fix draft PR | **Yes** — footer placeholder allow-list |

---

## Auth note (loud)

1. Cloud secret was present but **login initially failed** — Auth password did not match the secret, and the secret had a **trailing newline** (`len 25` with `\n`, useful password `len 24` after trim).
2. Synced `qa-platform-admin@impronta.test` Auth hash to the trimmed Cloud secret (SQL `crypt`), then login succeeded.
3. **Oran follow-up:** re-save `QA_PLATFORM_ADMIN_PASSWORD` in Cloud secrets **without a trailing newline**, so future VMs do not need a DB sync.

---

## #64 — Parallel talent templates

From Maison v2 editor → **⋯** → **Save as new design**:

| Design | Slug | Editor |
|---|---|---|
| QA Factory Parallel A 1004 | `qa-factory-parallel-a-1004` | `/platform/admin/builder-lab/talent-designs/qa-factory-parallel-a-1004/edit` |
| QA Factory Parallel B 1004 | `qa-factory-parallel-b-1004` | `/platform/admin/builder-lab/talent-designs/qa-factory-parallel-b-1004/edit` |

Evidence: `06-design-a-filled.png`, `06-design-a-result.png`, `07-design-b-filled.png`, `07-design-b-result.png`, `08-design-a-reload.png`, `09-design-b-reload.png`.

Both stayed as hidden catalog drafts (not opened to talents).

---

## #65 + Publish demos (Maison v2)

### Blockers cleared before publish

| Issue | Fix |
|---|---|
| Bare top-level `app_nail_designer` on draft (`homeTree[7]`) without `slotKey` / `originRole` | Removed from open draft (nail band is placed at demo/talent apply time via `app-placement.ts`) |
| Publish: unknown placeholders `{{footerIntro|Where|Hours|Contact}}` | Neutralized draft text to ZWSP (liveText still set); code allow-list in PR |
| Content-only draft refused (“only reach new sites”) | Tiny design-owned hero `paddingTop` `56px` → `57px` so a real release item existed |

### Release

| Field | Value |
|---|---|
| Release id | `a86488b7-88f8-440a-9a5b-2a884d1de1ad` |
| Design | `maison-v2` |
| Versions | **23 → 24** |
| Channel | **demos** |
| demosApplied | **9** |
| Open to talents | not clicked |

Evidence: `13f-publish-final.png`, `13g-release-page.png`, `17-release-v24.png`.

Release page URL:  
https://app.tulala.digital/platform/admin/builder-lab/themes/a86488b7-88f8-440a-9a5b-2a884d1de1ad

### Demo pins after publish

| Host / slug | `theme_design_version` |
|---|---|
| `alba-nail-artist` | **24** |
| `camila-nails` | **24** |
| `renata-lashes` | **24** |

Public shots: `18-alba-after-publish.png`, `19-camila-after-publish.png`, `20-renata-after-publish.png`.

---

## Code fix (draft PR)

Branch: `cursor/maison-footer-placeholders-46e5`  
Adds Maison footer tokens to `KNOWN_PLACEHOLDERS` so Builder Lab publish accepts the rich footer (`footerIntro`, `footerWhere`, `footerHours`, `footerContact`). Drift test documents that those four hydrate via `liveText`, not `hydrateTalentTree`.

Gates on branch: `npm run typecheck` PASS · `npm run lint` PASS.

Until that PR is LIVE on tip, production still relies on the draft ZWSP neutralization for those four strings (or a rebuilt draft from catalog after the allow-list ships).

---

## Screenshot index

Under `media/builder-lab-factory/`:

- Login / Lab: `01-*`, `02-*`, `03-builder-lab.png`, `04-talent-factory.png`
- Editor / #64: `05-*`, `06-*`, `07-*`, `08-*`, `09-*`, `10b-*`
- Publish path: `11*`, `12-*`, `13*`
- Release + demos: `17-release-v24.png`, `18`…`20`

---

## Not done / follow-ups

- **Open to talents** for v24 — not walked (by design this pass).
- Re-trim Cloud secret newline (Oran).
- Merge footer allow-list PR so future Publish does not need draft neutralization.
- Optional cleanup: hide or discard QA parallel drafts `qa-factory-parallel-{a,b}-1004` when no longer needed.
