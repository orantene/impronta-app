# Chat card + front-door dock: one merged guest chat

Status: built on `feat/chat-card-front-door` (base `origin/integ/fresh-qa`, `origin/fix/chat-chips` merged).
Scope: presentation merge plus wiring. No new backend, no new server actions, no flag changes, no DB writes.

## Decision

There is ONE guest chat. The front-door dock (`MiniChatPanelColumn`) is the engine and keeps every function.
The Maison v2 "chat card" is its default SKIN on talent sites (`chat.variant = card`). The old second chat
(`CardChatColumn.tsx`, `CardChatPanel`) is removed; its useful parts moved into small `CardDock*` pieces that the
dock column renders.

## Where each piece comes from

| Piece | Source | Where it lives now |
|---|---|---|
| White rounded card, desktop float | card variant | `card-dock-skin.ts` `cardFrameStyle`, `CardDockFrame.tsx` |
| Phone bottom sheet (new) and full-screen expand | brief + owner request | same; compact = bottom sheet, compact + expanded = inset 0, desktop expanded = tall 560px card |
| Token colours, dark palettes | card variant (`--cc-*` vars from site tokens) | `paletteFor("card")` returns `CARD_PALETTE` (all `var(--cc-*)`), so EVERY dock surface (composer, gate, cards, shelves, sheets) restyles from one switch, light or dark |
| Header: photo, name, city, round buttons | card variant | `CardDockHeader.tsx` |
| Tabs Hablar, Servicios, Mis citas + count badges | dock (`GuestDockNav`) | unchanged component; label for the middle tab is "Servicios" in card mode |
| Progress rail ("Falta el día", intake facts) | dock (`GuestJourneyProgress`) | unchanged, under the header |
| Category pills, catalog, selection shelves | dock (`GuestDockLineupView`, `GuestDockCatalog`) | unchanged, shown inside the Servicios tab |
| Her services with Agregar / Preguntar | card 2.6 (`CardChatServiceBrowser`) | top of the Servicios tab (`CardDockServicesView`) |
| Selection tray "Enviar pedido · N" | brief | `CardDockServicesView` tray; button = the column's existing `onSendToAgency` (or the start-inquiry hop when no draft exists) |
| Mis citas (visitor bookings) | dock (`GuestDockProjectsView`) | unchanged: title, status pill, summary line, time |
| Note line "Escríbele a X. Nada se envía..." + greeting bubble | card variant | `CardDockIntro`, passed to `GuestConversationBody` as `cardIntro` (replaces the dock's serif greeting only when the skin is on) |
| Quick-question chips (fill the composer, never send) | card 2.6 | `CardDockAskFooter` above the composer |
| Context card "asking about" | card 2.6 | `CardDockAskFooter` (shown when a service is staged via Preguntar or the booking sheet) |
| "Volver a mi reserva" | card 2.6 | `CardDockBackToBooking` above the thread |
| Composer: rounded input, round accent send | both already match | `MiniChatComposer`, restyled by the card palette; empty-thread placeholder is the card one |
| Gate, receipts, v5 cards, airlock, thread switcher, details sheet, claim email, offers, payment and paid states | dock | untouched; they inherit the card palette |

## Header layout (right side, all round 38px, same style as the close button)

`[photo] Name / city or status line ... [☰ Servicios (n)] [calendar Mis citas (n)] [expand] [x]`

- ☰ opens the Servicios tab. Badge = size of her selection (the inquiry lineup). Hidden when her dock Items tab is
  off and her "browse services" switch is off.
- Calendar (owner addition) opens Mis citas, the existing front-door tab. Badge = the visitor's inquiries/bookings.
- Both icons are tab switchers: a second tap returns to Hablar. `aria-pressed` marks the active one.
- The tab strip (`GuestDockNav`) is NOT drawn on Hablar (the icons carry it, no duplicate control). Away from Hablar
  it appears under the header so Hablar, Servicios and Mis citas are all one tap, with counts.
- Subline: honest reply time and city. Once a draft or sent thread exists it becomes the dock's status line (and, in
  draft, the switcher and the save retry), so nothing from the standard header is lost.
- Without the inquiry engine (no dock tabs) only expand and close render.

## Wiring rules kept

- `resolveChatVariant` and `ChatCardConfig` unchanged; `chatCard` prop still flows launcher -> panel.
- Sending, gate, claim email, offers, payments: the dock's own paths. The card adds no write path.
- Agregar fires `tulala:chat-add-service` (the Maison catalog island owns it) and the chat steps aside.
- Preguntar stages the pending offering (same store) and returns to Hablar, where the context card and chips show.
- Agency storefront dock (Impronta): `chatCard` is null there, so it renders the standard header and the standard
  palette, byte for byte as before. No variant switch needed beyond the existing `chat.variant` token.

## Removed (covered by the merged path)

- `CardChatColumn.tsx` / `CardChatPanel`: its frame moved to `CardDockFrame`, header to `CardDockHeader`, bubbles to
  the dock's own bubbles (token styled), gate and send bar to the dock's.
- Nothing user-facing was removed. `CardChatExtras.tsx` stays (chips, context card, back-to-booking, service list).

## Size housekeeping

`MiniChatPanelColumn.tsx` was at 799 lines. The legacy chip block and the captcha/error notices moved verbatim into
`GuestLegacyDetailChips.tsx` and `GuestComposerNotices.tsx`.

## Not in this pass (needs backend or product input, not presentation)

- "LO MÁS PEDIDO" shelf, per-service Guardar, and the "≈US$" line: no reader or currency-conversion helper for them
  exists in the codebase on this base (the brief only). The service list shows the existing price line.
- Servicios badge counts her selection, not a services count, because that is the number the dock tracks.
- Expanded mode on desktop is a taller card, not the 2-pane list used by the standard dock.
