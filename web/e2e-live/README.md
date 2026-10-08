# e2e-live

Read-only Playwright checks run against production by the Live QA Tester
(`playwright.live.config.ts`). One spec per ticket: `tul-<id>.spec.ts`.

    npm run live:check                    # every check
    npm run live:check -- tul-59 tul-119  # only those tickets (file-name match)

A check must be able to FAIL on the old broken behaviour: each test carries a
`Catches ...` comment naming the failure it guards. "Element is visible" alone
is not enough (TUL-134: the lightbox check passed while the lightbox was a
228x334 card with no next/back).

| Spec | Covers |
|---|---|
| tul-59 | Jorgelina's site guest P0/P1 items, strict lightbox (P1-10) |
| tul-107 | /start Spanish, readable, three choices |
| tul-118 | fresh site: no empty services/gallery/FAQ bands |
| tul-119 | /en + ES/EN switch (A-01), lightbox (A-06), help bubble hides on scroll (DS-13) |
| tul-123 | booking form: Turnstile, no visible hCaptcha puzzle |
| timing-harness | TUL-290: cold render time of Today, Messages, Profile, Builder, Clients, Services as TAL-93900 (3 loads each) + #418 count |
| dashboard-cards | TUL-354: read-only checks of the signed-in talent dashboard cards as TAL-93900 (hours drawer and New service form, 24h + dd/mm, one skip link, Load more, Today empty states, 18+ step, builder Add and Assets) |
| builder-behaviour | TUL-78 / TUL-79 / TUL-87 builder behaviour as TAL-93900, DRAFT ONLY on `jorg-beauty-qa`, never Publish; snapshots and restores the draft, deletes its qa-harness media |

builder-behaviour (on demand, writes to the TEST draft only). Env: `LIVE_BUILDER=1` (or `LIVE_TIMING=1`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (production project).
Run alone, desktop project only, no retries:

    cd web && set -a && . ./.env.local && set +a
    LIVE_BUILDER=1 npx playwright test -c playwright.live.config.ts builder-behaviour --project=desktop --workers=1 --retries=0

It prints the profile code and slug first, refuses anything but TAL-93900 + `jorg-beauty-qa`, snapshots the draft to a
0600 temp file and restores it (keyed updates only) at the end and on failure, and attaches full-page screenshots at
1280, 768 and 390 plus a pass/fail/ms table.

dashboard-cards (TUL-354, read only, run after each deploy). Same session mechanism and env as the timing harness
(`LIVE_DASHBOARD=1` is set by the script; `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` for the production project). It refuses any talent but TAL-93900, fails if a page names
TAL-93938, and never clicks Save, Publish, Delete or Submit or types into a field. Desktop project, one worker:

    cd web && set -a && . ./.env.local && set +a
    npm run qa:live-dashboard-cards

Checks that need particular data (Load more needs more than one page of photos, the Today empty copy needs an empty
Needs attention card, the 18+ step needs an account that has not accepted terms) SKIP with the reason; a skip is not a
pass. Unit tests for the verdicts: `npm run test:live-timing`.

TUL-108 has no spec on purpose: it is not a browser check. It is proved from
the `notification_dispatch_log` table, not from the page.

Phone project note: `page.mouse.wheel` is unsupported in mobile WebKit; scroll
with `window.scrollTo` in steps instead.
