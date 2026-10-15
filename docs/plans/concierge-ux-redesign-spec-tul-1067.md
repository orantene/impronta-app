# TUL-1067 Concierge UX redesign spec (mobile first), draft

Inputs: the Concierge widget audit of 2026-10-14 (TUL-1063..1068) and the dock code in `app/t/[profileCode]/_chat/`.

## Principles
- One persistent inquiry tray; the tabs only browse.
- Every Add confirms: toast + count bump + undo.
- Context is explicit: the list starts as the page's talent/agency, with a visible switch to the network (held for Oran, TUL-1063).
- Photos, prices and full names are never truncated away.

## Structure (390px)
1. Header: business/talent name, close.
2. Chips: Services, Packages, Talent, Talk, Yours. Packages hidden when empty (TUL-1065).
3. Rows: photo 56px, full title (wrap to 2 lines), owner, price + duration, one primary button (Add), one quiet button (Ask).
4. Sticky tray at the bottom: "Inquiry . 3" with a thumbnail stack; tap opens the tray drawer. Replaces the "In your inquiry / Saved" blocks repeated under every tab.
5. Tray drawer: items grouped by owner, remove per item, date step, "Send inquiry" primary.

## Send flow (TUL-1066)
Tray -> Date (availability-aware, Flexible allowed) -> Review -> Send. States: Draft / Sent / Waiting on them (only after send) / Needs you. An unsent draft is under Needs you (done in #3774).

## Saved vs Inquiry
Saved = long-lived wishlist across contexts. Inquiry = per context. A link "You also have 1 draft with Eli" replaces silent merging (scoped cart shipped in #3770).

## Empty and error states
Context-aware empty copy (no "No talent yet" in a services context, TUL-1063 #10). One error banner, cleared on tab change (done in #3770).

## Open design calls (Oran)
Owner chips, the scope switch, tray placement on desktop, and whether Talk keeps its own lineup strip.
