# Owner's hands

The only things in the company that need the owner. Maintained by the CEO by PR; a session never adds to this file. Each line says what was tried first and what exactly is the owner's act. Removed the moment it is done.

Updated 2026-09-06 03:35 UTC.

| # | Item | What was tried | The owner's act |
|---|---|---|---|
| 1 | Admin sign-in for QA | A magic link for qa-admin@impronta.test was minted twice; the harness classifier blocks the CEO's browser from opening the verify URL; handing it to a bypass-mode session would launder a denied permission | Add an allow rule for the browser navigate tool on `pluhdapdnuiulvxmyspd.supabase.co/auth/v1/verify*` in the CEO session's settings, or sign in yourself in any session's browser pane |
| 2 | Appointments Manager session | It is absent from the session list; its findings live in merged PRs and #1798 | Reopen it or name it |
| 3 | MX and SPF records for tulala.digital | Reply-To now routes replies to the tenant (proven from dispatch rows); the platform address itself still bounces | Add the records at the DNS account |
| 4 | The $20 ticket purchase on El Paisa | The event exists through the engine's writers; the guest page is live signed out; every state before and after the card is the CEO's to run | One real-card purchase when the CEO says the page is ready |
| 5 | Meta and TikTok developer sign-in | The Integration Director read the whole path, found three blockers and fixed the two in code (#1880, #1887); the apps need the owner's identity | Sign in to developers.facebook.com and TikTok for Developers in your Chrome and leave them signed in |
| 6 | Stripe webhook events | Finance found refund.failed and refund.updated unsubscribed on the live endpoint | Subscribe both in the Stripe dashboard, live mode |
| 7 | Stripe connector in claude.ai | Not reachable from any session | Reconnect it in your claude.ai settings |
| 8 | Impronta launch-party brief | The CEO accepted the event as the first real ticketed event | Send the brief |

Decisions the CEO made in the owner's lane, for ratification, are in the overnight report and in `docs/plans/` decision records; they are not on this list because they need no act.
