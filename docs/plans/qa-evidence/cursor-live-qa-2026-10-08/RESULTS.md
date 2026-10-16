# Cursor Live QA — 2026-10-08 midday

Public, read-only production checks. Hosts: `jorg-beauty-qa.tulala.digital`, `*-demo.tulala.digital`, look-only on `book-jorgelina.tulala.digital`. Viewports 1280 + 390. No sign-in, no book submit, no pay, no chat send.

Deploy stamp seen: `dpl_5nzNPcu6DCKbZuazbb3a4q7qNW5V`.

## Results table

| TUL-id | PASS/FAIL/NEEDS PM | one line | screenshot |
|--------|--------------------|----------|------------|
| TUL-72 | PASS | 390 sticky shows Reservar cita; click only scrolls to #services (external claim CONFIRMED) | `TUL-72-sticky-390.png` |
| TUL-88 | FAIL | alba 1280: header CTA=Menú y precios; hero=Ver servicios+Ver trabajos — theme seed release not on demos | `TUL-88-alba-1280.png` |
| TUL-106 | PASS | book-jorgelina 390: WA + Instagram + TikTok; WA prefill names the website | `TUL-106-social-390.png` |
| TUL-118 | FAIL | live-site: name+empty-bands OK; E-14 /en h1 still Spanish on qa-fresh-studio | `TUL-118-fresh-en-1280.png` |
| TUL-123 | NEEDS PM | needs PM: Turnstile key + guest_captcha_enforced ON + qa-journeys widget/token proof | — |
| TUL-125 | NEEDS PM | needs PM: isolated qa-journeys fresh signup + DB evidence | — |
| TUL-133 | PASS | qa-fresh-studio header shows business name (white-on-white rule no longer hiding it) | `TUL-133-header-1280.png` |
| TUL-139 | NEEDS PM | needs PM: qa-journeys test booking for single lightbox book event | — |
| TUL-165 | NEEDS PM | needs PM: design version not in public HTML; Done-when needs drift-monitor 0-behind ×7 days | `maison-v2-versions.json` |
| TUL-187 | FAIL | /en jorg-beauty-qa: no (in Spanish) bio hint; Spanish bio/copy still present | `TUL-187-qa-en-gallery-1280.png` |
| TUL-189 | FAIL | jorg-beauty-qa ES still shows Semi-permanent gel in ticker/menu | `TUL-189-ticker-es-1280.png` |
| TUL-206 | PASS | hub TAL-93938: Book/Reservar controls visible (27) | `TUL-206-hub-1280.png` |
| TUL-209 | FAIL | alba /en still Spanish in portfolio titles + nail promo (external /en-Spanish CONFIRMED) | `TUL-209-alba-en-1280.png` |
| TUL-232 | FAIL | alba chip only scrolls to #services (no slot-preselect sheet); jorg-beauty-qa has no chip (external CONFIRMED) | `TUL-232-alba-after-click-1280.png` |
| TUL-240 | PASS | book-jorgelina 390: IG/TikTok/WA links in header | `TUL-240-header-social-390.png` |
| TUL-246 | FAIL | #book opens guest dock, not booking sheet (jorg-beauty-qa + book-jorgelina look-only) | `TUL-246-hash-book-1280.png` |

## Counts

- **PASS:** 5 (72, 106, 133, 206, 240)
- **FAIL:** 7 (88, 118, 187, 189, 209, 232, 246)
- **NEEDS PM:** 4 (123, 125, 139, 165)

## External tester claims

| Claim | Verdict |
|-------|---------|
| "Reservar cita" bottom bar only scrolls to services | **CONFIRMED** (TUL-72 on jorg-beauty-qa) |
| /en still shows Spanish (aftercare, captions, categories, nail promo, tab title) | **PARTLY CONFIRMED** — nail promo + portfolio titles on alba /en (TUL-209); categories on jorg-beauty-qa /en looked English in menu; tab title OK (`Alba · Tulala`) |
| jorg-beauty-qa no next-free-time chip | **CONFIRMED** (chip present on alba demo only) |
