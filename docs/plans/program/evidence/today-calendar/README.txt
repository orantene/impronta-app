Talent Agenda V2 evidence (A3.2).

Capture:
  cd web && PLAYWRIGHT_BASE_URL=https://app.tulala.digital \
    QA_TALENT_EMAIL=... QA_TALENT_PASSWORD=... \
    node scripts/capture-agenda-evidence.mjs

Or full smoke (more PNGs):
  cd web && QA_TALENT_EMAIL=... QA_TALENT_PASSWORD=... \
    npx playwright test e2e/talent-agenda-smoke.spec.ts

A3.2 production capture (2026-09-24, qa-talent-max@impronta.test):
  today-evidence.png
  calendar-evidence.png
  attention-evidence.png
  new-booking-evidence.png

Note: TALENT_AGENDA_V2 may be off on production; screenshots still document reachable talent routes until allow-list is set (talent id 12b95e5c-ea28-45b9-909e-f478ca9dc5f2).

Smoke suite may also write:
  today-desktop.png, calendar-desktop.png, attention-journey.png,
  new-booking-journey.png, finish-collect-entry.png, today-390.png,
  new-booking-390.png, calendar-360.png
