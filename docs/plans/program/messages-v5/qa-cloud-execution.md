# Messages v5 QA — Cloud Agent execution contract

Cloud-safe rewrite of `CURSOR-QA-PROMPT.md` for Cursor Cloud Agents in `/workspace`.
The Mac multi-agent worktree recipe does not apply here.

## Binding rules (unchanged)

1. Never write on a real tenant (Impronta, El Paisa, any tenant you did not create).
2. Never move `production` by hand, never force-push `main`/`production`, never admin-merge.
3. Additive migrations only; apply to both Supabase projects before merge.
4. Principle 0: Messages is a front door to the POS engine, never a second writer.
5. Copy: "client" never "customer"; no em dashes; USD; v5.1 tokens.

## Cloud adaptations

| Topic | Rule |
|---|---|
| Path | `/workspace` only. Branch `cursor/qa-messages-v5-11b1`. |
| PRs | Open/update via ManagePullRequest. `gh` is read-only. **Human merges.** |
| QA host | `https://staging-qa-journeys.tulala.digital` (isolated DB `fxlankepwnvelxjrahwk`). |
| SSO | Prefer `VERCEL_AUTOMATION_BYPASS_SECRET`. Fallback: share-link → gitignored `.playwright-vercel-storage.json` + `PLAYWRIGHT_STORAGE_STATE`. Refresh share link before expiry (~23h). |
| Journeys mirror | Do **not** force-push `program/journeys-2026-09`. Record SHA skew; human syncs. |
| Gates | Scoped eslint + `test:messaging` while iterating. One full `npm run typecheck && npm run lint` before push. |
| Dev server | Never for QA. Never `next build` locally. |
| Defects | Append `D-MSG-300+` in `decisions.md`. |
| Done | Spec passes on QA host **and** fix is on `main` (after human merge). |

## Sign-in

```
/api/dev/signin?email=qa-journeys-owner%40impronta.test&next=%2Fadmin%2Fmessages
```

Staff: `qa-journeys-staff@impronta.test`. Talent: `qa-journeys-talent@impronta.test`.

## Run env

```bash
cd web
export PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital
export PLAYWRIGHT_SKIP_WEBSERVER=1
export PLAYWRIGHT_USE_DEV_SIGNIN=1
export PLAYWRIGHT_STORAGE_STATE=/workspace/web/.playwright-vercel-storage.json
export JOURNEYS_FIXTURE_READY=1
npx playwright test e2e/qa-program --workers=1 --project=chromium
```

## Method

1. Write spec under `web/e2e/qa-program/<area>/` before clicking.
2. Run; screenshot evidence to `web/e2e/qa-program/evidence/<date>/`.
3. Fail twice → `D-MSG-3xx` → fix → re-run → update checklist in `qa-program-log.md`.
4. Known seams in the original prompt §11: retest, do not "fix".

## Order

6.1 admin desktop → 6.2 tablet/phone → 6.3 client link → 6.4 POS → 6.5 guest → 6.6 parity → §7 product deps.
