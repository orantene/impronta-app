# Remove the experimental WhatsApp drawer

This feature is isolated so a failed test can come out without breaking Messages, POS, or web chat.

## Instant disable (no deploy of deletes)

1. Unset `TULALA_WHATSAPP_DRAWER` if it is set.
2. `update platform_settings set workspace_messaging_channels_enabled = false where id = true;`
3. The button and drawer render nothing. Existing Messages and POS keep working.

Do not read `workspace_messaging_channels_enabled` from `loadPlatformWorkspaceUi()`. A missing column there would hide FAB/POS. `web/src/lib/channels/flag.ts` is the only reader.

## Full delete (one PR)

Delete these trees:

- `web/src/lib/channels/`
- `web/src/components/admin/channels/`
- `web/src/app/(workspace)/[tenantSlug]/admin/settings/channels/`
- `web/src/app/(workspace)/platform/admin/settings/PlatformMessagingChannelsCard.tsx`
- `web/src/lib/server-actions/admin-platform-messaging-channels.ts`
- `services/channel-worker/`
- `web/e2e/cases/channels-whatsapp.spec.ts`
- `supabase/migrations/20261231231006_channel_connections_outbox.sql` (only if it has not been applied; otherwise leave the additive tables)

Revert the one-line mounts (search `WhatsAppTopBarButton` / `WhatsAppDrawerHost`):

- `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`
- `web/src/components/admin/shell/internal/page-modules/MobileTopBar.tsx`
- `web/src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx`
- `web/src/components/admin/pos/PosHeader.tsx`
- `web/src/components/admin/pos/PosFrame.tsx`
- `web/src/app/(workspace)/platform/admin/settings/page.tsx` (the experimental card + `isMessagingChannelsEnabled` import)
- `web/src/components/admin/shell/canonical-routes.ts` (`settings/channels` matcher)
- `web/src/components/admin/shell/canonical-routes.test.ts` (the `/admin/settings/channels` row)
- `web/package.json` (`src/lib/channels/*.test.ts` and `src/components/admin/channels/*.test.tsx` on existing lanes)
- `web/.env.example` (the experimental WhatsApp drawer block)

Restore these files to `main` if they still mention WhatsApp outbox:

- `web/src/lib/messaging/channels/whatsapp.ts` (original stub)
- `web/src/app/api/webhooks/messaging/[channel]/route.ts` (legacy body only)
- `web/src/lib/server-actions/messaging-engine.ts` (drop the `whatsapp` exception)
- `web/src/app/api/cron/messaging-delivery-retry/route.ts` (drop the skip)
- `web/src/components/admin/pos/messages/MessagesShell.tsx` (drop optional `channelFilter`)

Delete `dashboard.channels` keys from `web/messages/{en,es,fr}.json`.

Do not revert `inquiries.channel` or the POS Messages work. Those are independent.
