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

TUL-108 has no spec on purpose: it is not a browser check. It is proved from
the `notification_dispatch_log` table, not from the page.

Phone project note: `page.mouse.wheel` is unsupported in mobile WebKit; scroll
with `window.scrollTo` in steps instead.
