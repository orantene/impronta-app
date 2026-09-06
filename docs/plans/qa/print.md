# QA — Print Canvas (Piece B)

Owner: Page Builder / Print Canvas. New rows go here (see [README](README.md)); format is
`| do this | proves | falsified by |`, executable by someone who has never seen the code.

## READ FIRST — what is and is not reachable right now

**#1793 (merged) renders NOTHING on its own.** It shipped the `print` surface kind, the adapter,
the config and the `print_designs` table — but **no route mounts it**. There is nothing to click in
#1793 by itself; every row below exercises **slice 1b (#1860)**, which is the code that mounts
#1793's config.

**Slice 1b (#1860) is NOT on production yet.** It is an open PR. Until it merges **and** the
production pointer advances, these URLs 404 — and a raw `*.vercel.app` preview 404s too (not in
`agency_domains`; see the QA caveat in CLAUDE.md). So:

> **BLOCKED: every row below until #1860 is merged and deployed** (then QA on a seeded host —
> `app.tulala.digital` / `impronta.tulala.digital` — not a preview URL).

**Scope of what these rows prove, once unblocked:** the editor **shell** — door → list → create →
mount, with print chrome suppression. They do **NOT** prove a print piece can be *designed* or
*exported*: the print block palette (QR/title/caption/logo nodes), the fixed artboard + trim guide,
the `builderTreeToPrintDesign` extractor and the export route are **slice 1c → slice 2**, not built.
Do not write a "design a card / download a PDF" row yet — it would be the executable-but-false kind.

## Host + path

Use the workspace-admin host where you already reach `…/admin` as the QA admin, and append
`/print`. Paths (tenant slug = your QA workspace's slug):

- **List / door:** `/<tenantSlug>/admin/print`
- **Editor mount:** `/<tenantSlug>/admin/print/<id>` (you reach it by clicking a design, not by hand)

## Rows (BLOCKED until #1860 deploys)

| Do this | Proves | Falsified by |
|---|---|---|
| Go to `/<tenantSlug>/admin/print`. Screenshot at desktop and at 375px. | The door/list route renders under admin chrome for a staff user; empty state is legible. | 404 / "Host not registered"; a crash card; a blank canvas; horizontal scroll at 375. |
| On that page, click **"Design a print card."** | `createPrintDesignAction` inserts a `print_designs` row for **this** tenant and routes to `/<tenantSlug>/admin/print/<id>`; a new id appears in the URL. | Stays on the list; an error toast; the URL id is blank; a row is created for the wrong tenant (check it appears in the list on return). |
| From the editor, navigate back to `/<tenantSlug>/admin/print`. | The just-created design now shows in the list (newest first), by name. | The list is still empty, or shows another tenant's designs. |
| In the `/<tenantSlug>/admin/print/<id>` editor, look at the top bar. Screenshot desktop + 375. | Print chrome suppression: **no device/viewport switcher**, **no Publish** control (print has no live publish in v1). The builder shell otherwise mounts. | A viewport switcher is present; a Publish button is present; the editor fails to mount / shows "0 sections" over a crash. |
| In a second browser tab, open the same `/<tenantSlug>/admin/print/<id>`, edit in one, save, then save in the other. | The OCC version guard: the second save is refused with "changed in another tab," not a silent clobber. | The second save succeeds silently and overwrites the first. |
| As a NON-staff user (or signed out), open `/<otherTenant>/admin/print/<id>` for a design you do not own. | The route 404s for both "not authorised" and "not found" — no leak of whether the design exists. | You see the design, or an error that distinguishes "exists but forbidden" from "not found." |

## Verification already done (not owner-hands)

- `npm run typecheck` (governor) **PASS** on the rebased slice-1b tree.
- Diff scope: only the 4 print files, 266 insertions, 0 deletions (rebased clean onto current main;
  no 39-file poison from the old base).
