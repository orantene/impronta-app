# Onboarding · one front door + redesigned flow (P11, 2026-09-17)

Reference: the owner's ten-screen mockup (welcome · describe · AI understands · essentials · style · account · creating · ready · site · next steps).

**Clicked by me on the isolated stack, phone viewport (375 px):** `?start=business` opens the module with the business title, Type / Voice / Link control and progress bar → sentence → reading (bar, ticks, ring) → card with icons → "Looks good" → **essentials** (category picker found "Yoga studio"; name; services as chips; city picker found Tulum via Google; hours preset; WhatsApp with the +52 prefix applied) → **style** tiles + note → **Ready to build** with every fact and an available link → **building** (dark, spinner, progress, rotating line) → **ready** with the framed site over a placeholder, address, primary into the builder, next-steps list.

**Defects found by clicking, fixed before this shipped:** services split on comma/Enter (was one chip); WhatsApp bare number was refused although the field promised +52; a new sentence inherited the owner's previous brief (now archived); the frame showed a blank box on a slow load (placeholder); a talent page was framed before it was live (not any more).

**Playwright, mobile-onboarding project:** shell-open-and-resume, understood, account, build-arrival: 14/14 after four assertions moved to the new design (arrival title, Spanish entry title, +52 handled by the field, taxonomy term in the bio).

**Gates:** typecheck 0, lint 0, `verify:ui-messages` 0, `verify:server-actions` 0, message-key-usage guard 0 (38 dead keys removed), onboarding + tulala + i18n lanes 382/382.

**Not done here:** the design-brief conversation for style (tiles + one note for now); services as pick-from-catalogue; city search outside Mexico; the Apple sign-in button from the mockup (no Apple provider configured, so no dead CTA).
