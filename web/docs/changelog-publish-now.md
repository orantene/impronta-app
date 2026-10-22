# Notion "Publish now" button for Releases (TUL-1391)

The Notion API cannot create a Button property, so someone adds it in the Notion UI once.

1. Open the Releases database, add a property of type Button named `Publish now`.
2. Automation steps, in order:
   - Edit property: `Status` = `Published`.
   - Edit property: `Published at` = now.
   - Send webhook: `POST https://app.tulala.digital/api/cron/changelog-sync`
     with the header `x-changelog-sync-secret: <CHANGELOG_SYNC_SECRET>`.
3. `CHANGELOG_SYNC_SECRET` is a server environment variable (Vercel). The value is pasted
   only into the Notion webhook header. It is never rendered to a page or sent to a browser.
   Rotate it by changing the env var and the Notion header together.

The same endpoint also runs every 15 minutes from the cron, so if webhook buttons are not
available on the Notion plan, publishing still goes live within 15 minutes.

Platform Admin has a second path that needs no Notion button: `/platform/admin/changelog`,
"Sync changelog now" (super admin only). It calls the same sync function on the server.
