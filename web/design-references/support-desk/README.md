# Support Desk — Phase 0.5 mockups

Clickable static HTML prototype. **Fake data only.** Yellow **Simulated** banner on every view. Does not write to production, send email, charge, or notify.

## Live Desk (primary test path)

Production Desk is already enabled (`SUPPORT_DESK_ENABLED=1` on Vercel production + preview). Platform-admin only:

- https://support.tulala.digital/desk
- Login with your platform-admin (`super_admin`) account
- Same queue/actions as Platform HQ Support; host chrome only

These HTML mockups are an optional design reference for A–I chrome comparison — not the product under test.

## Serve mockups on :3099

From `web/`:

```bash
npm run mockup:support-desk
```

Or from repo root:

```bash
python3 -m http.server 3099 --bind 127.0.0.1 --directory web/design-references
# or
./web/design-references/support-desk/serve.sh
```

Open:

- Hub: http://127.0.0.1:3099/support-desk/
- Inbox: http://127.0.0.1:3099/support-desk/#/inbox/needs_you
- Mobile: http://127.0.0.1:3099/support-desk/#/mobile/queues
- Login states: http://127.0.0.1:3099/support-desk/#/login/default
- Journeys: http://127.0.0.1:3099/support-desk/#/journeys

## Controls

- Prototype bar: theme (light/dark), viewport (1440 / 390), role (owner/agent/specialist/guest)
- Hash routes for screens A–I and journey entry points
- Yellow **Simulated** banner on every view

## Oran review focus (mockups)

1. Click through hub → A–I (light + dark, 1440 + 390)
2. Confirm forest brand / note chrome / AI draft card / recipient line
3. Confirm Oran B-target chrome: Tulala mark + “Support Desk” wordmark, ops global search, Inbox presence + avatar, customer-first ticket header with SLA countdown; ES tickets use Spanish previews
4. Compare against live Desk at `support.tulala.digital/desk` — mockups are reference, not a 1:1 gate
