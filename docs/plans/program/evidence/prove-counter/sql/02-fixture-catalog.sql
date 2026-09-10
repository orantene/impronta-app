-- The two catalogue items this journey needed, and how they got there.
--
-- NEITHER WAS INSERTED. Both were created through the workspace's own
-- Menu screen (`/admin/catalog` → MenuPage → TalentOfferingsManager, owner
-- `{ kind: "workspace" }`) in a real browser signed in as the fixture owner:
--   "Garlic bread"    — title + Fixed price 6.50 + Save. A SECOND priced item,
--                       so the sale's total is the sum of two different prices
--                       rather than one price times a quantity.
--   "QA gala ticket"  — title + Fixed price 12.00 + "Direct booking" +
--                       "Needs the buyer's name (email or phone), whatever it
--                       costs" ticked, reason "attendee_names". This is what
--                       makes `startCollection` refuse an unnamed buyer.
--
-- Read back afterwards (this file is the READ, not the write):
SELECT id, title, amount_cents, kind, owner_kind, status, booking_mode,
       requires_identity, identity_reason, sort_order
  FROM talent_offerings
 WHERE tenant_id = '33333333-3333-4333-8333-333333333333'
   AND title IN ('Garlic bread', 'QA gala ticket');
-- [{"id":"75742607-c24c-4f08-9c35-4ebc0591b2c7","title":"Garlic bread",
--   "amount_cents":650,"kind":"service","owner_kind":"workspace",
--   "status":"published","booking_mode":"request",
--   "requires_identity":false,"identity_reason":null,"sort_order":3},
--  {"id":"11f597f4-daeb-4186-8245-4c39b8e7bc00","title":"QA gala ticket",
--   "amount_cents":1200,"kind":"service","owner_kind":"workspace",
--   "status":"published","booking_mode":"instant",
--   "requires_identity":true,"identity_reason":"attendee_names","sort_order":4}]
