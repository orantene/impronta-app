# POS Messages evidence

**PDF handoff:** combined `docs/plans/program/pos/Tulala-POS-Messages-v2.pdf` (Part1 + Part2).
`board.png` rendered with PyMuPDF at dpi 110.

## Live proof (wire-messages, 2026-09-11)

`live.png` files were captured on the isolated env (Supabase branch
`qa-journeys`, fixture tenant `33333333-3333-4333-8333-333333333333`, dev
sign-in as `qa-journeys-owner@impronta.test`) from a local `next dev` of the
`work/wire-messages` branch behind the `qa-journeys.local` host proxy, at the
board's viewport (1194x834 tablet, 834x1194 portrait for MS31, 390x844 phone
for MC / MM / CC). Every shot is the real route with the workspace's own rows:
`/admin/pos?mode=counter&view=messages`, `/admin/messages` at 390px,
`/c/t/<signed token>`, `/pay/<real link code>`. No shot comes from
`/c/t/preview`. Where one live state serves several boards (the options sheet
for MS07 to MS10, the customer thread for the MC card boards) the same shot is
copied and the note says so. The dev-only identity banner (36px on the tablet,
96px on the phone) is in every shot and pushes the fold; it does not exist in
production.

QA data written to the isolated tenant for the proof (never production): two
existing paid orders marked `source_channel = 'messages'` (`62510234…`,
`91a21246…`, `fd8a7f4d…`), one `conversation_records` row linking the draft
`a74b4c21…` to inquiry `80fcf41b…` (the paid one was unlinked again), and one
payment link `t3tdxujs1jfp6ege2kdf` minted through the UI.

Seam shots live in `seams/`: `seam2-back-to-sale`, `seam3-orders`,
`seam3-receipts-origin`, `seam3-kitchen-origin`, `seam4-workspace-chips`,
`seam6-c-dispatch`.

Verdict key: **matched** / **partial** (what differs and why) / **not-wired**
(no live door, or not staged).

| Board | Verdict | Note |
|---|---|---|
| MS01 | not-wired | No live door: nothing raises the toast on a real inbox (D-118). `board.png` only. |
| MS02 | partial | live.png from `/admin/pos?mode=counter&view=messages`, Awaiting customer filter, Cora Cuevas open: rail row with badge 9, header, wrapped filters, row = name · channel · time · unread · states · record chip · next action, thread, essentials. Differs: no location switcher / operator chip in the header (workspace has one location); rows show the customer's initials and one preview line; the composer's 'Ask for a name / Send options' suggestion bar is not drawn; the dev identity banner pushes the composer to the fold. |
| MS02B | partial | live.png: Details toggle collapses the inbox to a rail with the open count and the essentials to a rail; every commerce action is under the Actions control. Differs: the collapsed rail draws 'Inbox 2' text, not the board's icons. |
| MS03 | partial | live.png: the Resolved filter on the fixture is empty and shows the empty state with 'Share your booking link'. Failed-load and no-results states not staged live (a search that matches nothing lands on the sheet, D-117). |
| MS04 | partial | live.png: Ask opens the capture sheet with the two policy sentences and the confirm action. Differs: no field list of chat-suggested details to confirm; the sheet says the rule and offers one button. |
| MS05 | partial | live.png: Match existing opens the match sheet with the relink-impact sentence. Differs: no candidate list (phone match vs name-only) is drawn; the fixture has one customer and `messagingMatchCustomers` is not called from the sheet. |
| MS05B | partial | Same live shot as MS05: the impact sentence is there; the moved/kept lists per record are not drawn. |
| MS06 | partial | live.png: Assign owner opens the assign sheet with the owner sentence and Assign to me. Differs: no owner list; `messagingAssignOwner` is called with `ownerUserId: null`. |
| MS07 | partial | live.png: Actions → Send options opens the picker with 'Send for the customer to choose' and 'Add to draft'. Differs: no tabs per family and no thumbnail preview of the customer card; the option kind is a text token. |
| MS08 | partial | Same sheet as MS07; the sent · viewed · selected card states are rendered by `OperatorCard` only when such a message exists (none on the fixture). |
| MS09 | partial | Same sheet as MS07; the salon times family shows no durations or slots (no reader on the sheet). |
| MS10 | partial | Same sheet as MS07; eligibility / conflicts per phase are not drawn. |
| MS11 | partial | live.png: Create or link shows what is already linked (the order chip, now labelled 'Order' not `order`, D-114) and the create action. Differs: no per-kind create list. |
| MS12 | not-wired | The offer sheet has no control that opens it (D-116). Preview only. |
| MS13 | not-wired | Same as MS12 (D-116). |
| MS14 | partial | live.png: Request payment sheet with Deposit / Full amount / No payment now / History. Differs: no amounts on the buttons (the board's $1,350 · $405 · $945) and no counter option; a deposit with no figure is refused in a sentence (D-112). |
| MS15 | partial | live.png: after Full amount a real $18.00 link was minted through the UI (D-112 fixed); the payment card shows `sent` and the amount in the thread. Differs: the requested → opened → paid history line is not drawn. |
| MS16 | not-wired | The follow sheet opens only from a row whose next action is follow-up; no such row on the fixture and no other door. Preview only. |
| MS17 | not-wired | No door (D-116). |
| MS18 | not-wired | No door (D-116). |
| MS19 | not-wired | No door (D-116). |
| MS19B | not-wired | No door (D-116). |
| MS20 | not-wired | No door (D-116). |
| MS21 | partial | live.png: New conversation sheet with name, email, phone, channel and the web-chat sentence (D-POS-84). Differs: no contact-method note on the row. |
| MS22 | partial | live.png: Actions → Internal note opens the note sheet; the composer's Internal note segment is visibly different from Customer. Differs: attachment states are the D-POS-83 sentence only. |
| MS23 | not-wired | No door (D-116); delivery states are not drawn on cards. |
| MS24 | not-wired | Resolve acts directly (`messagingResolve`); the resolve/handover sheet has no door (D-116). |
| MS25 | partial | live.png: typing 'Cora' in the search box. Differs: rows are not filtered by the typed text; submit opens the search sheet and jumps to the first hit (D-117). |
| MS26 | partial | live.png: Actions → Schedule a reminder opens the reminder sheet with the one-per-record sentence. Differs: no time picker, no cancelled/failed reasons. |
| MS30 | not-wired | No door (D-116). |
| MS31 | partial | live.png at 834x1194: the thread takes the width. Differs: the POS rail hides under 900px and the return strip is the header button, not a strip; no reader result. |
| MC01 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC02 | partial | live.png: `/c/t/<token>` for the fixture conversation; four message cards and the continue-on-phone form. Differs as above. |
| MC03 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC04 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC05 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC06 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC07 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC08 | partial | live.png: the same thread after the request; the Payment card (18.00, Pay securely, keep-slot sentence) is a real card from `messagingRequestPayment`. Differs: offer version/terms cards are not on this thread. |
| MC08B | partial | Same live shot as MC08; the decline path is not drawn. |
| MC09 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC10 | partial | Same live shot as MC08: 'Pay by' reads on the checkout, not on the card; 'Paid · Remaining' result not staged (no live payment). |
| MC11 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC11B | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC12 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC13 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC14 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| MC15 | partial | live.png: `/pay/t3tdxujs1jfp6ege2kdf`, a real open link: lines, USD 18.00, expiry as the venue clock 17:13 (was the raw ISO instant, D-115), keep-slot note, Pay securely. Differs: no pickup time line, no brand header. |
| MC16 | partial | live.png: `?status=paid` on the open link now renders the processing state ('Payment is still open for verification. Nothing extra was taken.'), never Paid (D-115). |
| MC17 | not-wired | Not staged live: no provider is configured on the isolated env and a mock confirm would settle a fixture order. Preview only. |
| MC18 | not-wired | Not staged live: needs an expired link; an unknown code is the site 404. Preview only. |
| MC19 | not-wired | Not staged live (double attempt). Preview only. |
| MC20 | partial | live.png is the real `/c/t/<token>` thread for the fixture conversation (same shot for every MC card board): a signed token from `signThreadToken`, cards rendered as plain message cards. Differs: no brand header ('Casa Nube Centro · usually replies within the hour'), no card of this kind on the fixture thread, no 'Message Casa Nube…' composer; the continue-on-phone form is drawn. |
| CC01 | not-wired | No door to the change-review card (D-116). |
| MM01 | matched | live.png at 390x844 from `/admin/messages`: the phone list under the mobile bar (seam 5, D-POS-117): search, scrolling filters, rows with name · channel · time · subject · states · record chip · unread. The bar is Today · Calendar · Clients · Sales · More per D-POS-90. |
| MM02 | partial | live.png: the thread pushes over the list; record chip replaces the header chips; Actions / Payment link / Tap to Pay (disabled, sentence) / Cash / Pay at pickup and the composer. Differs: the dev identity banner (96px on a phone) pushes the composer under the bar; `live-actions.png` is MM02B (Actions sheet open, now reachable, D-113). |
| MM03 | partial | live.png: Payment link opens the request sheet on the phone (D-113 fixed). Differs: MW07's collect shape (amounts, provider hand-off) is the tablet sheet. |
| MM04 | not-wired | The paid/remaining card needs a settled payment; not staged live. |
| MM05 | not-wired | No door (D-116). |
| MM06 | not-wired | No live toast (D-118); the workspace Today block is D-POS-114. |
| MS27 | not-wired | Board note empty in the handoff; no screen mapped. |
| MS28 | not-wired | Board note empty in the handoff; no screen mapped. |
| MS29 | not-wired | Board note empty in the handoff; no screen mapped. |

Counts: matched 1 · partial 40 · not-wired 22 of 63.

## Not wired (controls with a sentence, or no door)

- The ten preview-only sheets (D-116) and the incoming toast (D-118).
- Tap to Pay on the phone thread: disabled with `dashboard.pos.messages.disabled.tapToPay`.
- Attach a file: disabled with `dashboard.pos.messages.disabled.attach` (D-POS-83).
- Web chat as a staff-started channel: refused with a sentence (D-POS-84).
- Deposit with no amount: refused with `refusal.invalid` (D-112); the sheet has no amount field.

## Prototype specs (MSG-P1 … P12)

Run on the same dev server with `JOURNEYS_FIXTURE_READY=1`, `--workers=1`,
one file at a time; results in `runs/`. The specs sign in on
`/admin/pos?view=messages` directly (one render instead of two: the counter's
own render is 7 to 23 s on a loaded machine and the default `/admin/pos` hop
spent the 30 s budget on Sell). `?view=messages` without a mode used to lose
the view on the mode fill-in redirect; fixed in `page.tsx`.
