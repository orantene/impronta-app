# Agent A, signed-in Live QA on a9277d1f7 (local prod build :3008, isolated fxlank)

Fresh accounts (stamp arawtc): A myself, M2 myself, S studio, B both (accounts-A.json). Client qa-r6-guest-arawtc@impronta.test. Real captcha widget on every guest booking; no shared rows touched. A Playwright retry of the first run created extra accounts (stamp arqgxq, front door showed "No se pudo empezar" once on retry); killed.

| Card | Verdict | Facts / evidence |
|---|---|---|
| 61 | PASS | account icon + signed-in summary on talent site (run-A2-client-account.log) |
| 62 | PASS (tabs); visit detail + receipt BLOCKED | four tabs render; no paid visit (order pending_payment, no Stripe). a-client-A-account.jpg |
| 64 | FAIL; custom-domain SSO BLOCKED | /me /cuenta /client 404 on talent host; agency host sends role-less client to /onboarding/role; agency login generic Tulala brand. a-client-B-login.jpg |
| 77 | FAIL (one point) | myself site PASS; workspace site nav /services /about /gallery /contact /directory 404. c09-B_ws-home.jpg |
| 86 | PASS | myself->both and studio->both. run6-TUL-86-10/12 |
| 93 | BLOCKED email, rows PASS | in_app sent + user_notifications row; email dispatch skipped (no endpoint); talent notification title English |
| 117 | PASS core, 3 caveats | see messages; a146-lang.out |
| 120 | PASS; AI support BLOCKED | sign-out, no error banner, Messages empty state; AI stub only |
| 146 | FAIL (English trade label on /talent/profile); support panel BLOCKED | /es/start Spanish now |
| 267 | PASS | A guest booked 09:00; B /book 192 slots |
| 374 | PASS | agency_domains subdomain rows for S, B, M2, hosts 200 |
| 379 | FAIL residual | thread panel English strings; 24h not observable |
| 395 | PASS | a395-ready-step.jpg |
| 416 | PASS | 'No hay nada en esta vista' |
| 438 | PASS | studio owner card on Ajustes > Espacio; talent profile created. Note: talent_profiles.display_name for S is the account label (qa-onb-choice-studio-s-desktop-arawtc), not the workspace name |
| 487 | PASS | no 'Display name is required' |
| 433 | PASS core | inquiries created; post-confirm page needs Secure cookie (http artifact); button read 'Confirmar' |
| 451 | PASS | inquiry + order pending_payment + booking confirmed in B tenant |
| 125 | PARTIAL | bios both languages + stock hero OK; /en hero paragraph Spanish |
| 442 | PASS | secondary_locales ['en'], /en 200 |
