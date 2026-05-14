# Steps 1–5: Entry-point HTTP probes

Cold HTTP probes against the QA dev server (`localhost:3010` worktree
on phase-1 @ `329e63cc4`) to verify form rendering structure at each
of the 5 inquiry entry points. No login required — public surface only.

## E1 — Public directory cart (`/directory/cart`)

- **URL probed**: `http://impronta.lvh.me:3010/directory/cart`
- **HTTP**: 200 (after 307 → /directory redirect chain)
- **Page rendered**: `/directory` (`/directory/cart` is a legacy redirect page → `app/(public)/directory/cart/page.tsx` is now a `redirect("/directory")` only).
- **Inquiry form on this URL?** No. The directory page renders a search form (`<form class="mx-auto w-full max-w-2xl">` containing one `<input type="text" placeholder="Describe your event or talent needs…">`). The actual inquiry form opens via the **cart drawer** — a client-rendered side sheet that is not in the SSR HTML.
- **Honeypot present in SSR?** No — drawer-rendered.
- **Verdict**: 🟡 **Probe inconclusive at HTTP level — needs JS-driven browser to open drawer and inspect.**
- **Follow-up**: Browser walk (P0.A) — open `/directory`, click any talent card "Inquire", visually verify form layout matches `f4d1ec5de` consolidation.

## E2 — Talent public page (`/t/TAL-92001`)

- **URL probed**: `http://impronta.lvh.me:3010/t/TAL-92001` (Sofía Herrera)
- **HTTP**: 200, 218KB SSR
- **Markers present**: `InquiryCart` (form name), `max-w-2xl` (consolidation class), "Inquire about" CTA appears 3+ times.
- **Verdict**: ✅ **InquiryCartForm shipped with consolidation class.** SSR includes form scaffolding.
- **Follow-up**: Browser walk — verify drawer width at 440px doesn't break the 2-col phone+company pair from `f4d1ec5de`.

## E3 — Workspace client `/new` (`/[tenant]/client/inquiries/new`)

- **URL probed**: `http://app.lvh.me:3010/impronta/client/inquiries/new`
- **HTTP**: 200, 70KB SSR
- **Auth gate**: Unauthenticated request renders a login form (`<form action="" encType="multipart/form-data" method="POST">` + "login" text appears 7+ times).
- **Verdict**: ✅ **Route correctly gates unauthenticated access to a login form.**
- **Follow-up**: Logged-in browser walk — already verified in v1; now needs re-verification of `f4d1ec5de` layout consolidation (max-w-2xl, paired phone+company, section headings).

## E4 — Admin manual sheet (admin shell button)

- **URL probed**: `http://app.lvh.me:3010/impronta/admin`
- **HTTP**: 200, 70KB SSR
- **Auth gate**: Same as E3 — login form rendered for unauthed user.
- **Inquiry form in SSR?** No — the "New Inquiry" sheet is a client-rendered overlay triggered from the admin shell toolbar.
- **Verdict**: 🟡 **Sheet renders client-side — needs logged-in browser walk to inspect form layout.**
- **Follow-up**: P0 step 4 — log in as qa-admin, open New Inquiry sheet, verify same consolidated layout applies (uses the same `<InquiryCartForm>` per `web/src/components/admin/shell/internal/messages.tsx`).

## E5 — Pitch landing (`/share/pitch/[token]`)

- **URL probed**: `http://impronta.lvh.me:3010/share/pitch/3bf19001-5b0b-4f3d-a599-76522f767b54` (an active pitch with `status='sent'`)
- **HTTP**: 200, 60KB SSR
- **Markers present**: `<title>Talent pitch · Tulala</title>` — pitch landing page renders. One mention of "inquir" in HTML.
- **Inquiry form in SSR?** No. The pitch landing renders a card layout (`max-w-sm rounded-2xl`) — likely a "Reserve / Inquire" CTA that opens a drawer or redirects to a converter, not an inline form.
- **Verdict**: 🟡 **Pitch landing renders correctly but inquiry form not in SSR.** The pitch→inquiry conversion path is opaque at HTTP level.
- **Follow-up**: Browser walk — click the inquire CTA, inspect what form opens. Confirm pitch token + talent_ids are forwarded into the form's hidden fields.

## Summary table

| Entry | URL | SSR has form? | Verdict |
|---|---|---|---|
| E1 | `/directory/cart` → `/directory` | No (drawer client-side) | 🟡 needs browser |
| E2 | `/t/TAL-92001` | Yes (InquiryCartForm + max-w-2xl visible) | ✅ probe pass |
| E3 | `/impronta/client/inquiries/new` | Login gate | ✅ auth gate works |
| E4 | `/impronta/admin` | Login gate (sheet renders client-side) | 🟡 needs login |
| E5 | `/share/pitch/[token]` | No (card landing, CTA opens drawer) | 🟡 needs browser |

## Gaps surfaced by these probes

1. **E1 (directory cart) is a redirect-only route.** The QA plan v2 §1a row claiming "form layout wide" was wrong — the directory inquiry flow is drawer-driven from `/directory`. Plan needs correction.
2. **E2 SSR ships InquiryCartForm + consolidation classes** — `f4d1ec5de` work is reaching the talent-page surface. ✅
3. **E5 pitch landing form path is opaque without a logged-in browser** — the pitch token doesn't gate the SSR page (200 returned), but where the form actually opens is unclear from HTML alone.
4. **E3/E4 auth gates work** — login redirect for unauthed users on workspace routes is confirmed.

## Next action

E2 is the only entry point fully verifiable via HTTP. Steps 1, 4, 5 need a logged-in browser session (which requires the user driving Chrome) OR a programmatic browser like Playwright. For this session, switch to engine-path walks (steps 6–9, 12–18, 20) which can be exercised server-side via the inquiry engine modules + service-role.
