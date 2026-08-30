# Guest support + lead chat — integrator QA

Manual checks only. Do these on a **preview aliased to a seeded host** (raw `*.vercel.app` 404s). Prove the page is hydrated by clicking a known control before concluding any UI is broken.

Localhost does not prove cookie signing, KV fail-closed, or deliverability.

## Preconditions

1. `GUEST_COOKIE_SECRET` is set on the Vercel project. If unset, the launcher must **not** render and guest actions must refuse. Confirm in Vercel env — this environment could not list env vars.
2. Upstash KV vars are set. If unset, guest AI must refuse (fail closed), not serve unlimited tokens.
3. Do **not** flip `GUEST_CHAT_CAPTCHA_WIDGET_READY`.
4. After QA, delete every ticket, lead row, and test account created in production (`delete ... where id = '<uuid>'` one statement at a time).

## Checks, in order

| # | Where | Do this | Expected |
|---|---|---|---|
| 1 | `https://tulala.digital/` incognito, signed out | Look for the floating `?` launcher on `/` **and** `/pricing` | Visible on both. Absent if cookie secret is unset (then stop and set it). |
| 2 | Same, click launcher | Ask a product question (e.g. "What is on the free plan?") | Ticket is created. AI answers with real feature/pricing copy. No admin-drawer internals. |
| 3 | Same thread | After the first AI answer | A contact card is **in the transcript** (survives reload). Email was not required to ask. |
| 4 | Same thread | Submit name + email on the card | Card accepts. Confirmation email arrives **with a working `/contact?t=` resume link**. HQ queue shows the email. |
| 5 | Different browser | Open the resume link | Thread loads with full history. New guest cookie is rebound. |
| 6 | New incognito thread | Request a human **before** giving an email | Escalation works. HQ shows **NO REPLY CHANNEL** on that ticket. |
| 7 | HQ `/platform/admin/support` | Reply to a guest ticket **that has** an email | Prospect receives the email. `notification_dispatch_log` has a `sent` row for `support.message.agent.guest`. This is the single most important check. |
| 8 | `https://tulala.digital/es/` | Repeat step 2 in Spanish | Answer is grounded, not "I'm not sure". |
| 9 | Signed in on `tulala.digital` | Ask from the launcher | Ticket has **both** `requester_user_id` and `guest_session_id`. It appears in the in-app support list. Email prompt is skipped. |
| 10 | `https://improntamodels.com/` | Look for the floating launcher | **Absent**. `/contact` is **404** (agency allow-list). Marketing `/contact` is **200**. |
| 11 | Guest chat | Ask "has anyone had payouts frozen?" | No confirmed-insight / other-tenant incident text. |
| 12 | Guest chat | Instruct the model to output a phone number and an external email | Both stripped. HQ subject is prefixed `[guest]`. |
| 13 | API | Loop `POST /api/ai/guest-support-chat` on one ticket | Turn ceiling refuses **before** the adapter. With Upstash unset, the route refuses rather than serving. |
| 14 | HQ queue | Filter Guests; search the prospect email | Guest chip works. Guest glyph is not the client bullet. Email is in the haystack. Past tickets by email show for a returning guest. |
| 15 | Sign-up | Sign up with the captured **confirmed** email | Ticket attaches (`requester_user_id` set, `surface` stays `guest`). A different account with an **unconfirmed** email cannot claim it. |
| 16 | `?` header menu | Click Ask a question / Help / Contact | Opens the launcher, `/help`, `/contact`. No primary `mailto:`. `help@tulala.digital` is gone from `/help/[role]`. |
| 17 | `/contact` on tulala.digital | Submit the form | Creates a **human**-handled guest ticket (`handled_by: human`). No AI run. Name + email visible in HQ. |
| 18 | Platform Today | Recent leads card | Chat leads appear with a Chat badge and deep-link to `/platform/admin/support?ticket=…`. Signup conversion % is unchanged. |

## Do not claim from this doc

Nothing above is verified by the build agent. Automated tests cover ownership, guest audience, Spanish corpus, turn ceiling, insight isolation, and `/contact` allow-list. Live and visual checks are yours.
