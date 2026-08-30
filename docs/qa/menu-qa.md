# Menu QA checklist

Manual verification after `feat/workspace-menu` lands. Automated gates prove the
money spine and builder wiring; this file is the live click-through list.
**Do not claim UI paths work until these are checked.**

## Preconditions

- Migrations `20261226000000`–`20261226000005` applied (`npm run db:push` / smoke).
- Workspace staff account on a seeded host (`impronta.tulala.digital` or local
  host registered in `agency_domains`).
- At least one published workspace Menu item (`owner_kind=workspace`).

## Admin Menu editor

1. Open Admin → **Menu**.
2. Create a workspace item (product or service), publish it.
3. Confirm it does **not** appear on a talent Services editor for the same tenant.
4. Edit / archive; confirm only `owner_kind=workspace` rows are listed.

## Public orderable menu

1. Drop **Menu - orderable** (or use Restaurant/store orderable page design) on a
   published page.
2. Confirm published workspace items render with prices and quantity steppers.
3. Place an order with name + email (guest or signed-in).
4. Confirm inquiry + booking created; `agency_bookings.calendar_lane = 'order'`,
   `booking_sub_type = 'service'`, `starts_at`/`ends_at` set.
5. Confirm no `talent_holds` / `talent_bookings` rows for that booking.
6. Confirm commission snapshot attributes house lines to the workspace (not a
   talent). Revenue equals offer total.

## Calendar

1. Open Admin → Calendar for the order's date.
2. Confirm an **Orders:** prefixed chip and green tone when status is confirmed /
   booked.
3. Agenda/day list shows the Orders label.

## Isolation

1. Tenant A publishes a menu item; Tenant B's `menu_board` must not show it
   (fetcher `.eq(tenant_id)` — public RLS is global).
2. Staff of Tenant A cannot mutate Tenant B's menu via forged `tenantId`
   (authorizeForWorkspace mismatch).

## Display vs orderable

1. Gallery shows **Menu - display only** and **Menu - orderable** as separate tiles.
2. Display-only insert has no order form / no `menu_board`.
3. Decorative restaurant page design still uses `menu_items` repeater.

## Out of scope this PR (do not fail QA on these)

- Product fulfilment / shipping UI for house orders.
- Capacity / `units_consumed`.
- Photo upload on workspace menu items (blocked until media owner path exists).
