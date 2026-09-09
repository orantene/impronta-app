# Preserved · changed · added · unverified (design deck v3.3)

## Preserved from v3.1 (connected, not recreated)
Customer search/create/attach-failure (C06–C10), item configuration and validation (C04–C05), discount eligibility (C13), pass redemption at sale (C20), expired holds (C17–C18), floor/timeline/list (T01–T03), table operations (T04–T24), preparation acknowledgment (T11, T26), customer display (D01–D08), refund lifecycle (M16–M19), receipts (M14–M15), drawer controls (M21–M23), payment takeover (M11–M12).

## Changed
See `v3.1-corrections.md`. Plus: money typography in the UI face; recovery actions in the normal primary; "Link only" vs "Link & pay".

## Added (product journeys, each connected to the shared payment states)
Events presale E01–E15; gate G07; appointments A01–A10; classes/passes K01–K07; reservations R01–R06; guest table QR Q01–Q07; packages/membership/gift card P01–P09; agency/client work O03–O06; Spaces & Resources S01–S06; Field Services F01–F09; counter C30–C32; mode switching M33; multi-seller M32; minimum spend below-minimum T28.

## v3.3 corrections verified in the exported PDF
Page 62 (B03) shows $1,740 in the list, summary and Collect; E11 moves or cancels the dependent workshop; P01/P02 room 17:00–18:30 with staff setup shown separately and no 8-seat alternative for 10; R05 replacement covers 19:55–22:10; M26 PIN pad and footer reachable; T28 is the below-minimum state; E09 order count derives from the AD-733 fixture (4 credentials); O03/O04 earned amounts derive from the PJ-27 fixture. Every frame (189) probed for horizontal clipping: none.

## Connected prototype
`Tulala-POS-prototype.html` — counter (sale → options → cash/card with waiting/unknown/declined/late-success → receipt → next customer) and tables (order → send delta → station acks → move lines between checks → collect → departure → reset) driven by one state machine, with a 17-check self-test that runs on load (attempt locking, single application of late success, delta dispatch, paid-check lock, total conservation, deposit applied once).

## Still unverified / not designed
- Device-size behaviour of keyboards, PIN pads, touch targets, contrast (Awaiting prototype).
- Any card-reader state on real hardware or a Mercado Pago sandbox (Awaiting external verification).
- Offline policy is designed (C27, M28, M29) but no offline implementation exists.
- Not designed: agency amendment acceptance from the office screen, membership pause/cancel screens, gift-card redemption at Collect (referenced only), talent earnings statement detail, EN/ES beyond two representative screens, short-landscape tablet and desktop-workspace POS variants.
- No screen is "complete" in the program sense until its actions are implemented and verified; see `case-progress.md`.
