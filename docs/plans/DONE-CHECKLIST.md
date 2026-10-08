# Tulala "Done" checklist (talent product), 2026-10-02

> **Status legend:** ✅ live proven · 🟡 built not live · ❌ missing · ⏸ Oran-deferred only (MX payments, USDC, CFDI/tax, lawyer, MCP agent booking).

How to use: each question must be answered **YES, proven live** (screenshot or test + link) to count as done.
"Yes on localhost", "yes in code" or "yes behind a flag" = NOT done. Mark each: ✅ live-proven · 🟡 built, not proven · ❌ missing.
Test on TAL-93900 (Jor's test copy), Valeria TAL-93901 (Free), and a fresh sign-up, in ES and EN, on a phone (390px) and desktop.

---

## 1. Sign-up and onboarding
1. Can a brand-new person register, verify email, and land in onboarding with no dead end?
2. Does onboarding finish with a published site the person can open on their own URL?
3. Can they pick a design (AI pick or gallery) during onboarding and see it applied immediately?
4. Does every trade (beauty, wellness, chef, creative, technical…) get sensible default services, copy and imagery?
5. Is the 18+ rule enforced, and is it clear why?
6. Does the Free plan go live instantly with no approval wait?
7. Can a person stop halfway, come back tomorrow, and resume where they left off?
8. Is the whole flow fully in Spanish for an ES user (no English leaks)?

## 2. Talent dashboard core
9. Does every item in the rail open a working page (no 404, no empty shell)?
10. Does the dashboard follow the talent's language choice and remember it?
11. Is there a clear "what to do next" on the home screen for a new talent?
12. Can a talent edit profile, photos, bio, tagline and contact in one place and see it live?
13. Does the account menu (avatar) give quick links to Site, Builder, Money, Messages, Settings?
14. Is every money amount shown in the talent's currency (MXN or USD) with the ≈US$ line where needed?
15. Is there zero placeholder or demo data on a real talent's dashboard?

## 3. Services and catalog
16. Can a talent create, edit, reorder, hide and delete a service, with price, duration, variants and add-ons?
17. Do service edits show up on the public site and in chat booking immediately?
18. Do quote-type services open a quote request (never the booking sheet)?
19. Are both languages of a service name and description kept when saving (no wipe)?
20. Can a talent set where the service happens (studio, home visit, online) and travel rules?

## 4. Agenda, booking and orders
21. Can a client book an available slot from the talent's site and see a truthful status (requested, confirmed, paid)?
22. Can the talent accept, decline, reschedule and cancel from the Agenda?
23. Are double bookings impossible (agenda, holds and chat proposals all check the same availability)?
24. Do bookings without a time (offer accepted, no slot) show somewhere visible ("Sin hora")?
25. Does "Finish → Card" (collect payment at the end) create a correct order and pay link?
26. Does cancelling a paid booking show "refund pending" and lead to a refund action?
27. Does accepting an offer never create a duplicate booking?
28. Does the client get confirmation and reminder messages (email and/or in-app) that are correct?
29. Can the talent see today's and the week's schedule clearly on a phone?

## 5. Messages (Messages v5)
30. Can a client start a chat from the talent site and the talent reply from /talent/inbox?
31. Can the talent send an offer or quote from the chat, and can the client accept it in the chat?
32. Can the talent control the booking from Messages (accept, decline, reschedule, cancel, send pay link) without leaving the thread?
33. Does the thread show the linked booking, order and payment status, kept in sync with the Agenda and Money?
34. Do the net split and fee lines show correctly in the chat payment card?
35. Does the gear drawer (settings in chat) work, including tips and payout preference?
36. Do new messages trigger notifications (push, email) that open the right thread?
37. Are messages kept in the talent's language and the client's language correctly?

## 6. Agentic / AI booking and payment through chat
38. Can a client book a service end to end by chatting with the talent's AI assistant (pick service → time → confirm)?
39. Can the AI assistant send a real pay link in the chat, and does the booking flip to PAID only after the payment webhook confirms it?
40. Does the AI never invent prices, availability or promises, and hand off to the talent when unsure?
41. Can the talent see and override everything the AI did in the thread?
42. Is the MCP / AI booking server (agent-to-agent booking) live and tested end to end? (Currently NOT started: owner go needed.)
43. Is there a clear on/off switch for the AI assistant per talent?

## 7. Payments and money
44. Is the talent's Stripe onboarding (US Express) working from the dashboard, with a clear status?
45. Does a $100 seller-pays booking charge the client $101.50 and pay the talent 100 minus the real card fee?
46. Does the "client pays the card fee" option charge about $104.84 and pay the talent exactly $100?
47. Do refunds return the right amount (net of fees, partial proportional) and block safely when the fee is unknown?
48. Are receipts and confirmation PDFs showing fee lines and "fees are non-refundable"?
49. Does Money (Dinero) show correct totals: earned this month, owed, cash, pending (cancelled ones excluded)?
50. Can the talent record a cash or transfer payment (full or partial) and see it in the ledger after reload?
51. Does Mexico (Stripe MX) work end to end for an MX talent? (Deferred.)
52. Do USDC payouts work for Argentina/Mexico talents? (Deferred / not proven.)
53. Are subscription plans (Free / Web Office / higher) purchasable with correct Stripe prices?

## 8. Website and page builder
54. Is the free website ONE page in the builder, and does it publish correctly?
55. Free plan: are Add section and Move/reorder blocked in the builder AND rejected by the server?
56. Paid plan: can the talent add, move, duplicate and remove sections freely?
57. Does the builder back arrow go to the dashboard, with the avatar menu offering quick links (no "new pages" for talents)?
58. Is every font, size, colour and shape of a design editable in the builder (designs are editable defaults)?
59. Do Website Settings (booking mode, chat/inquiry, pause banner, address, logo) work for every talent, and change the live site?
60. Can a talent connect a custom domain, with clear errors in ES/EN?
61. Does the talent site have correct SEO (title, description, canonical on the right host, sitemap, hreflang)?
62. Can a bilingual talent run an ES + EN site (primary + secondary language)? (Planned, not built.)
63. Do legal footer links go to the right language page?

## 9. Templates, themes and the gallery
64. Can the owner start building MULTIPLE new talent templates in Builder Lab at the same time, separate from agency starters?
65. Can the owner edit a talent design visually against its mockup and release it (Talent Theme Studio)?
66. When a template or theme gets an update, are talents using it notified ("New version available") with a one-click upgrade?
67. Is the upgrade safe: talent content and overrides kept, preview before apply, undo available?
68. Do demo talents automatically get the updated template version?
69. Is every one of the ~32 themes distinct, mobile-correct and free of fixture leaks?
70. Is the design gallery redesigned to the 2026 standard (profile-like demo cards, ⓘ tooltips, one primary action, no dead ends)? (Track G.)
71. Can a talent switch theme without losing content?
72. Are generated or free images coming from Tulala platform stock?

## 10. Apps (app library)
73. Is there an Apps tab where a talent sees suggested apps for their trade plus all apps?
74. Can a talent turn on an app (e.g. Nail Designer) and see it on their site?
75. Is Nail Designer ported 1:1 from the owner's design and working for clients?
76. Do apps ↔ templates link both ways with no dead end?
77. Are premium apps marked and gated correctly?

## 11. Demos
78. Are all demo talents (224 seeded from the workbook) live, each with a unique theme, real-looking content and imagery?
79. Can demo talents be refreshed or rebuilt with one command without touching real talents?
80. Do demo pages show the person's name, city, languages, booking mode and apps?
81. Can the demo inboxes (demo.tulala.digital) receive email (password resets work)?

## 12. Notifications and email
82. Can hello@, help@ and support@tulala.digital receive email?
83. Is the Stripe support email set to hello@ on both accounts?
84. Do transactional emails (booking, payment, reminder, password reset) arrive with correct language and branding?
85. Can a talent control which notifications they get?

## 13. Support
86. Can a talent or client open support from the dashboard or site and get an answer (AI first, human after)?
87. Can the owner work all support in the Support Desk (support.tulala.digital), including email from hello@? (Planned.)
88. Do support tickets show the talent's context (plan, bookings, payments, errors)?

## 14. Trust, legal and data
89. Are Terms, Privacy and refund policies published in ES + EN and linked everywhere required?
90. Is the talent clearly the merchant of record in the checkout copy? (Lawyer review pending.)
91. Do retention rules run (3y / 30d / 90d) and log what they would delete (dry-run first)?
92. Is no customer data visible across tenants (RLS verified, anon inserts bounded)?
93. Are Mexico tax / CFDI obligations decided? (Skipped for now, accountant TODO.)

## 15. Platform health (always-on)
94. Is main green and production equal to the latest green main?
95. Does `deploy:smoke` pass after every deploy?
96. Are all migrations applied (db:check green, objects verified)?
97. Are there zero open PRs older than 2 days without an owner?
98. Is there zero console error on the main talent pages (dashboard, site, builder, inbox, money)?
99. Does Sentry show no new top errors after the last deploy?
100. Is the PM board current and is every "Blocked-on-Oran" item real (not something Cursor could decide)?

---

## Known NOT-done as of 2026-10-02 (from this session)
- Payments end-to-end test (Track A) not yet run live; refund fee-source bug suspected.
- Free-plan builder locks (Track B) in PR #2471, not live.
- Booking/money fixes (Track D) in PR #2468, not live.
- Support email + Resend receiving (Track C) in PR #2470, DNS not done.
- Gallery redesign (Track G) just started.
- Template update notifications + demo auto-update: not built (verify and plan).
- Talent Theme Studio: vision only.
- Bilingual talent sites: plan only.
- MCP / AI agent booking: not started (owner go needed).
- Mexico payments, USDC, CFDI, lawyer items: deferred.
- Support Desk: Phase 0 starting.
