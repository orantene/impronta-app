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

## Servicios tab content (second pass)

The dock already had the data: `brand.dockServiceMenu` carries category pills and the price line
`guestDockServicePriceLabel` builds ("$500 MXN · ≈ US$28", via `lib/pricing/usd-equivalent`; no rate, no USD line).
The card Servicios tab now shows, top to bottom:

1. "LO MÁS PEDIDO": her first three services (her own order) as cards with the menu's price line and a Guardar button.
   Guardar fires the same add-service event Agregar did (adds to the booking selection) and Preguntar stays.
2. The dock catalog unchanged: category pills (Pestañas, Uñas, ...), service rows with price and CTA.
3. The dock's selection shelves, then the "Enviar pedido · N" tray.

## Not in this pass

- "Lo más pedido" is her order, not ranked by booking counts: no per-offering booking count is loaded into the dock.
- The tray counts the inquiry lineup (the dock's selection). A service picked in the booking selection dock lives in
  that page-level component and is not readable from the chat yet.
- Expanded mode on desktop is a taller card, not the 2-pane list used by the standard dock.

## Round 2 (owner-approved audit, supersedes the sections above where they differ)

Header
- The photo always shows (a monogram tile when there is none or it fails). No tab strip: the header round buttons
  (list = Servicios, calendar = Mis citas, both with count badges) are the navigation; away from Hablar a slim
  "Back to chat" link sits under the header. Expand shows on desktop (900px and up) only; phones keep list, calendar, close.
- Subtitle: the honest reply time when known, else the city.

Hablar, top to bottom: "Volver a mi reserva" strip, her greeting bubble, flexible space, then the context card and the
chips directly above the composer. One opaque surface (a solid base under the token surface, on the sheet and the scroll
body). ONE context card (the dock strip stays silent in the card skin). The composer opens empty (the booking-sheet draft
prefix is not applied in the card skin); the "nothing is sent until you tap send" line is the composer placeholder, with
no separate line. Chips are one horizontally scrolling row; with a service in context the first two are phrased about it.

Progress rail: hidden until she has a selection, then one compact line ("1 servicio · falta el dia").

Servicios: ONE list. Pills on top, "Mas pedido" first and selected (her first three), the other pills filter the same
list, no service twice (the dock catalog is not drawn under it in this skin). Row = thumbnail or icon tile, name, price,
one primary pill: "Agregar" for a fixed price (instant or request), "Pedir cotizacion" for a quote; tapping the name asks
about it. No Guardar. The "≈ US$" part shows only to visitors outside the talent's locale; Spanish visitors get one
"Precios en MXN" note. Variant-based "Elegir opciones" is NOT distinguished: the menu data carries no variants flag, and
the add-service event already opens the sheet when options are needed.

Mis citas: empty shows only the empty state and a "Ver servicios" button (opens Servicios); the filters appear with items.

Spacing: 16px gutters, 12px rhythm, filled chips and soft cards without borders, one header divider. Phone sheet opens at
about 85% height with a drag handle, full height only while an input has focus. Desktop: floating 400px by 640px card.

Left in place: `CardChatServiceBrowser` (and its tests) in `CardChatExtras.tsx` is no longer rendered; it can go next pass.
