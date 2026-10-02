# Support Desk design references

Phase 0.5 clickable HTML mockups land here. Phase 1a only reserves the folder
and the serve path — **no production Desk UI**.

## Serve on :3099

From `web/`:

```bash
npm run mockup:support-desk
```

Then open:

- http://127.0.0.1:3099/support-desk/

Or manually:

```bash
python3 -m http.server 3099 --bind 127.0.0.1 --directory design-references
```

Seeded fake data only. Never point mockups at production tickets or real emails.
