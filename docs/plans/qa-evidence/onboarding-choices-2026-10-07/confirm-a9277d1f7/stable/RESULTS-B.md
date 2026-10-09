# Agent B results (build a9277d1f7, isolated stack :3008, fxlank)

Accounts: M2 (talent, builder/dashboard cards; plan flipped talent_basic -> talent_portfolio for the builder run, restored), B (both; offers, orders). Own inquiries: 9812078c (/book, B tenant), 781067e6 (hub chat). No payments, nothing marked paid, no shared-row changes. Evidence: stable/B-*.jpg, B-b327-demos-log.txt, per-step lines in _progress-B.txt.

| Card | Verdict | Facts |
|---|---|---|
| TUL-78 builder core actions | FAIL (1 item) | PASS: Add opens with inspector open and stays open; insert lands after selected (Reviews > FAQ Section > Gallery Grid); Duplicate Hero/FAQ/Gallery/Ticker/Reviews + nested heading, no blocked toast; undo/redo exact; inline Cmd+A replace has no ghost; one toolbar; Escape clears selection. FAIL: #11 heading rich-text inspector field: canvas live in ~1.2s but focus jumps to canvas H1 ~500ms after typing (plain inputs keep focus, Tab moves). Free plan locks Add/Duplicate by design (tested on Web Office plan). Duplicated-block toast is English in ES UI. |
| TUL-396 builder gaps | FAIL (same item) | #3 PASS, #15 PASS, nested heading dup PASS, undo/redo PASS, #11 FAIL on heading field; nested Gallery/FAQ child inside a container not exercised. |
| TUL-79 hero / mobile | FAIL on #12 | #4 PASS: hero in viewport at 1280/834/390, no sideways scroll, mobile header CTA not overflowing, Mobile health 'Todo en orden'. FAIL: tablet frame blank ~5.0s (no skeleton); Tablet-editing panel (x36-332) overlaps canvas (x223-1057) at 1280. |
| TUL-81 toasts/banners | PASS exercised; 1 item BLOCKED | Draft saved toast z120, topmost over Publish dialog, contrast 5.96; no stale tab banner (never shown), no photos pill. Error toast over dialog not triggerable. Side: English dev text in ES Publish dialog. |
| TUL-182 money surfaces | PASS (ES UI) | Services, editor, new booking, Money, Clients, Today all `$N MXN`; US$ only on approx line. EN not checked; business admin dashboard mixes `$3,400 MXN` with `MX$850`. |
| TUL-225 WhatsApp channel | BLOCKED | Shipped artifact is a design doc only; no talent WhatsApp UI exists. |
| TUL-327 planned demos | PASS | All 8 design cards: strips list only named built demos, heading matches. Counter says 8 while 7 chips listed (unverified by eye). |
| TUL-435 Pedidos polish | PASS (observable parts) | '1 artículo', 'Reserva instantánea', `$850 MXN` one line, summary `$4,250 MXN`. messages_offer row / plural n>1 absent. |
| TUL-484 offer while invited | FAIL | Start no longer 'forbidden' but dead-ends on currency error (no chooser); workspace /book inquiry has no start control. |
| TUL-355, 381, 317, 280 | BLOCKED | Need an offer; cannot be started from UI (see 484). |
| TUL-319, 400, 429, 430, 437, 468 | MOVED TO PAID RUN | Per main; not attempted. |
