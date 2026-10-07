# Execution plan — CURSOR-NEXT Tracks A–F (2026-10-02)

Source: [cursor-next-2026-10-02.md](./cursor-next-2026-10-02.md) (rev 2).  
**Track G is out of scope** (queued: [track-g-gallery-redesign.md](./track-g-gallery-redesign.md)).

## Goal

Ship the finish-line remainder as **six parallel tracks** (A–F), each on its own branch/PR. Only the merge lane is sequential. Production pointer advances on green CI; never push `production` by hand.

## In scope

| Track | What |
|---|---|
| **A** | Payments E2E on Stripe sandboxes (TAL-93900); fix fee-snapshot / refund bugs found; evidence doc |
| **B** | Free plan: no Add / Move / reorder / duplicate / paste in talent page builder; server guard; tests |
| **C** | Stripe support email + app constant; Resend receiving (owner key); Vercel `STRIPE_PRICE_*` verify; MX tax decision recorded |
| **D** | Ten booking/money small defects (one PR); tests each |
| **E** | Authenticated QA pass on :3001 (TAL-93900 / Valeria); screenshots + defect list; route fixes into B/D |
| **F** | Cleanup: confirm #2466 closes source PRs; #2000 status; leftover Jor QA data list (ask before delete); archive-chat list |

## Out of scope

- Track G (gallery / library / Mi presencia / Apps redesign waves)
- Lawyer items, Theme Studio, Website Settings follow-ups beyond E’s QA of the live screen
- MCP / AI booking server
- Live Jor (`TAL-JORGBEAUTY`) payment tests; live MX without an owner-named MX test profile
- Inventing work beyond the source doc

## Ordered work items (parallel open; sequential merge)

### Open PRs in parallel (now)

1. **Track D** — booking/money defects (merge-lane #2 after #2466). Items D1–D10 from source; skip any already on `main` from finish-line #2463/#2464; finish the rest + tests.
2. **Track B** — Free builder locks (merge-lane #3). Client hide/disable + `free-site-tree-guard` / builder gate reject reorder/add; agency builder pin test.
3. **Track A** — A1 read handoff; A2 blocked on Oran `stripe login`; A3–A7 when unblocked; land any code fixes as the Track A PR (merge-lane #4).
4. **Track C** — code: support-email constant + public-copy sweep + MX tax decision doc; owner: Stripe dashboard emails, Resend key, DNS; price mismatch list (merge-lane #5 for code).
5. **Track E** — QA checklist on :3001 (Oran runs server); evidence under `docs/finish-line-2026-10-02/`; no drive-by redesign.
6. **Track F** — status report PR or notes: #2466 follow-through, #2000, Jor leftover ids, archive list.

### Merge lane (later, sequential)

`#2466` (lead) → **D** → **B** → **A fixes** → **C code**.  
Each: rebase → local gates → PR checks green → merge → wait `main` CI + `production` pointer → next.  
After last: `cd web && npm run deploy:smoke` from fresh `origin/main`.

## Verification (every code PR)

- `cd web && NODE_OPTIONS=--max-old-space-size=11264 npm run typecheck && npm run lint`
- `npm run test:<lane>` for files touched
- File-size ratchet: extract, never grow
- Evidence / screenshots where the source requires clicking a path
- EN + ES (tú), no em dashes, tokens not hex

## What ships first

1. **Track D PR** — remaining D items not already on main (highest merge-lane priority after #2466).
2. **Track B PR** — Free plan builder locks (independent files from D).
3. **Track C code PR** — support email constant + MX tax decision doc (no owner wait for those two).
4. Track A / E / F progress as unblocked (A waits on `stripe login`; E on :3001; F mostly reporting).

## Binding constraints (from source §0)

- Branches off latest `origin/main`; one PR per track.
- Test talent `TAL-93900` only for payments; Stripe TEST keys only.
- Migrations: additive, unique timestamp, `db:push` before merge if any.
- Hard stops: no MCP/AI booking server; lawyer items wait.
