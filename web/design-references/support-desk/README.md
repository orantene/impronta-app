# Support Desk — Phase 0.5 mockups

Clickable static HTML prototype for design review. **Fake data only.** Does not write to production, send email, charge, or notify.

This folder is a **design reference**, not production Desk UI. The live Desk shell already exists behind `SUPPORT_DESK_ENABLED` (default OFF on Vercel). Do not enable the flag from this PR.

## Serve on :3099

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

## Oran review focus

1. Click through hub → A–I (light + dark, 1440 + 390)
2. Confirm forest brand / note chrome / AI draft card / recipient line
3. Approve, revise, or reject as reference for future Desk polish
4. Keep `SUPPORT_DESK_ENABLED` OFF until an explicit enable decision
