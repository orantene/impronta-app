# Front chat: inventory, capability matrix, base engine memo (TUL-10)

Status: research only, from `origin/main` at e9a65be7c2 (2026-10-06). Code read, nothing run, no DB, no live QA.
Where a cell says "unverified" the code path was not traced end to end; treat it as an open question, not a pass.

Owner rule: ONE fully working front chat engine with every capability. Themes provide a visual skin only and never remove functions.

## 1. Headline finding

The one-engine decision was already taken and mostly executed (`docs/plans/chat-card-front-door-merge.md`). The guest dock
(`MiniChatPanelColumn`, front-door dock) is the engine. The Maison v2 "card" is a skin of it (`chat.variant = card`,
`paletteFor("card")`, `CardDock*`). The old second chat (`CardChatColumn`) is removed. So the work left is not "pick an engine".
It is: (a) make the skin seam a real contract instead of a `if (card)` sprinkle, (b) close capability gaps that exist in the
engine itself, (c) stop two surfaces (dock and `/c/[inquiryId]` v5 client thread) from drifting.

There is NO LLM that books or quotes on the guest front chat. The two `api/ai/*support-chat` routes are Support Desk
(platform help tickets), not the talent booking chat.

## 2. Inventory

| # | Implementation | Files | Renders where | Used by | Status |
|---|---|---|---|---|---|
| 1 | Guest dock engine ("front-door dock") | `app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx` (790 lines), `MiniChatPanelColumn.tsx` (791), `MiniChatPanel.tsx`, `GuestDock*` (Home, Catalog, Lineup, Items shelf, Projects, Nav, Chrome), `GuestConversationBody`, `GuestDetailChips*`, `GuestThreadSwitcher*`, `ConversationStatusStrip`, `GuestJourneyProgress`, `MiniChatComposer`, `MiniChatGateForm`, `ClaimEmailRecap`, `SentAirlock`, `TalentInquiryFormSheet`, `TalentIntakeNotice` | Floating launcher on talent sites (`/t/<code>` and talent-site host), launcher mount is `TalentProfileChatLauncherMount` | Every talent whose chat switch is on (`dockMounted`), all themes. Default skin = "standard" | LIVE. The engine |
| 2 | Talent site dock wrapper | `app/%5Ftalent-site/TalentSiteMessagesDock.tsx` (307), `TalentSiteContactBridge`, `TalentOfferingIntentQuery` | Server wrapper on the free talent site (`[[...pageSlug]]/page.tsx`), template-preview, builder render | Resolves switches (chat/off/inquiries), greeting in her voice, tenant, `chat.variant`, help bubble, then mounts #1 | LIVE. Not a second chat, a loader |
| 3 | Card skin | `CardDockFrame/Header/Panel/ServicesView/ChatExtras`, `CardChatExtras`, `card-dock-skin.ts`, `ChatHelpBubble`, `lib/talent-site/chat-card.ts` (`resolveChatVariant`, `ChatCardConfig`, colour-from-tokens) | Same dock, `chat.variant=card` | Maison v2 by default (`DESIGN_CHAT_VARIANT_DEFAULTS`); any site via token. Help bubble from Maison v2 catalog v20 | LIVE (flagged by design version). Mobile: bottom sheet, full-screen expand |
| 4 | Agency launcher | `app/(public)/_chat/AgencyChatLauncherMount.tsx`, `PublicChatSurface.tsx` | Agency directory + home (Impronta), talent-less inquiry (`agency_site`) | Agency tenants. Reuses #1 with `chatCard = null` | LIVE |
| 5 | Client full thread | `app/c/[inquiryId]/page.tsx`, `GuestFullThreadView/Header` (+ `OpenFullConversationLink` from dock) | Full-page conversation for a guest | Guests who open "full conversation" | LIVE |
| 6 | Messages v5 client thread | `components/messages-v5/client/*`: `ClientThreadView`, `ClientCards` (choice, tickets, offer accept/ask change/decline, payment, change, outcome), `use-client-card-actions`, `use-client-thread-paid-refresh`, `copy.ts` | Inside the dock and /c thread for typed cards (`guest-thread-v5.ts`); also `ClientMessagesShell` for signed-in clients | All guest threads that carry typed cards | LIVE. This is the card renderer, shared |
| 7 | Legacy typed cards | `components/chat-cards/ChatCard.tsx` (690), `PayNowSheet.tsx` (335): 11 kinds (Offer, Order, Payment, Booking, Balance due, Coordinator, Talent rate, Call sheet, Suggested talent, Reservation, ...) | Admin Messages (`admin-3/4`), `DetailsTab`, `MiniChatMessageBubble`, `GuestNextStep` | Admin/agency side mostly; dock imports it in 2 places | PARTIAL. Two card vocabularies coexist (v5 client cards vs `ChatCard`). English-only literals (`kind="Offer"`) |
| 8 | chat-interactions | `components/chat-interactions/*`: reactions, reply, pin, star, voice note recorder/player, overflow menu | Admin/agency messaging surfaces | Not found imported by the guest dock | ADMIN-ONLY. Candidate to lift into engine (see gaps) |
| 9 | AI: `api/ai/support-chat` | `app/api/ai/support-chat/route.ts` (275) | Support Desk ticket thread for signed-in users | Platform support, grounded on help corpus | LIVE but NOT the front chat. Replies only, escalates to human |
| 10 | AI: `api/ai/guest-support-chat` | `app/api/ai/guest-support-chat/route.ts` (355) | Support Desk for anonymous guests (guest ticket) | Platform support | LIVE but NOT the front chat. No tools, no booking, no quoting ("Do not invent prices", grounding text only) |
| 11 | Theme variants Maison/Folio/Gridline | Maison v2 = skin #3. No Folio- or Gridline-specific chat component found in `_chat`, `lib/talent-site` or the token registry (only `chat.variant`, `chat.help-bubble` exist) | n/a | Folio/Gridline render the standard dock | No fork exists. Good: nothing to retire |

Deleted already: `CardChatColumn`, `CardChatPanel` (second chat).

## 3. Capability matrix

Columns: **Dock** = engine (#1, standard skin), **Card** = card skin (#3, same engine), **/c** = full thread (#5/#6), **AI** = support-chat routes (#9/#10), **Admin cards** = legacy ChatCard/interactions (#7/#8).
Legend: Y = present in code, P = partial or unverified, N = absent. Card inherits the Dock unless noted.

| Capability | Dock | Card | /c + v5 | AI | Admin cards | Evidence / note |
|---|---|---|---|---|---|---|
| Greeting in talent voice + language | Y | Y | n/a | N | N | `resolveTalentChatGreeting`, `talentSiteChatVoice`, `chatConfig.greeting`; card adds `CardDockIntro` |
| Browse catalog | Y | Y | N | N | N | `GuestDockCatalog`, `getGuestItemsCatalog`; card adds `CardDockServicesView` |
| Pick variants / add-ons | P | P | P | N | N | Catalog + `attachOfferingToGuestInquiry`, `OfferingQuickPicker`; v5 `ClientChoiceCard` picks options. Variant/add-on depth per trade unverified |
| Book from real availability, truthful status | P | P | P | N | N | `onPickTime`, `next-free-times` (v5 client), scheduling-engine. Dock home path leans on "inquiry/ask" first; instant booking only when `talentOffersInstantBooking`. Status truth on dock not proven live |
| Quote request | Y | Y | Y | N | N | Inquiry send, `TalentInquiryFormSheet`, lineup "Enviar pedido" |
| Event detail chips (date, type, headcount, location, budget) | Y | Y | P | N | N | `GuestDetailChips*`, `GuestDetailChipEditor*`; progress rail |
| Offers accept / decline / ask change | P | P | Y | N | Y(admin view) | `ClientOfferCard`, `onAcceptOffer/onDeclineOffer/onChangeRecord`. Rendered in dock via v5 bridge; not proven live (memory: Accept/Decline NOT proven live) |
| Reschedule / cancel | N | N | P | N | N | Cancel appears only as `ClientChangeCard` (change_request/result, cancel + refund sentences) and `AppointmentCard` kit. No guest-initiated reschedule action found; grep for "reschedule" hits only kit/policy/engine |
| Pay link, Paid only after webhook | P | P | Y | N | P | `onRequestPayLink`, `resolvePayLinkPublicUrl`, `use-client-thread-paid-refresh` (refresh after pay), `payment_paid` card. Memory flags the paid-state flip and cold-load `?order=` as still owed |
| Tips | N | N | P | N | N | Word "tip" hits are false positives (ticket/option). No guest tipping flow located |
| Guest identity, email claim, `?order=` resume | Y | Y | Y | P | N | `checkGuestClaimEmail`, `sendGuestClaimToEmail`, `ClaimEmailRecap`, `getGuestInquiryByOrder`, `use-launcher-session-restore`. Cold-load `?order=` not proven live |
| Attachments | P | P | N | N | N | Only "pending look image" attach (`attach-pending-look-image.ts`). No general file/photo attach in `MiniChatComposer`. Voice notes exist only in `chat-interactions` (admin) |
| Status strip | Y | Y | P | N | N | `ConversationStatusStrip` + actor map; card folds status into header subline |
| Fullscreen / mobile sheet | Y | Y | Y | n/a | n/a | `ExpandedChatLayout`, `CardDockFrame` (compact = sheet, expanded = inset 0), `GuestDetailBottomSheet` |
| AI assistant that books/quotes | N | N | N | N | N | No LLM touches the booking chat. Scripted flows only (chips, catalog, intake form). The two AI routes answer platform-support questions from a help corpus and escalate; they never create bookings or prices |
| Talent notifications on guest message | P | P | P | N | N | Send action path exists; notification fan-out per channel (push/email/WhatsApp) not traced. Unverified |
| Lands in Messages v5 inbox + Agenda + Money | P | P | Y | N | N | Inbox yes (v5 thread contract, `guest-chat-contract.ts`). Agenda/Money landing depends on offer/order creation by the talent; recent Finish-to-Card work (#2265/2266) covers Agenda to Card, not guest-to-Agenda. Unverified end to end |
| a11y + 390px | P | P | P | n/a | n/a | aria in launcher, status strip, catalog; `use-focus-trap`; render tests exist. No recorded 390px QA matrix; reduced-motion coverage unverified |
| Reactions / reply / pin / star / voice | N | N | N | N | Y | Only in `chat-interactions` (admin) |
| Locale parity (ES/EN) | P | P | P | P | N | i18n translator used in dock/card; `ChatCard` has English literals; v5 `copy.ts` has locale tests |

## 4. Gaps, ranked

1. **Truthful booking from availability in the guest chat** (instant-book talents): engine has `onPickTime` + scheduling-engine but the dock's primary path is inquiry-first. Needs one proven path: choose time from real free slots, status reads "requested" vs "confirmed" truthfully.
2. **Pay + Paid truth and `?order=` cold-load**: owed in memory. Paid must flip only after webhook, and a cold `?order=` must resume the right thread.
3. **Offers accept/decline in the dock** not proven live; blocks money flow.
4. **Reschedule/cancel by the guest**: absent as an action. Only talent-initiated change cards exist.
5. **Tips**: absent. (Owner decided talent = merchant; needs a payments decision before build, see payments strategy memory.)
6. **Attachments**: only a pending look image. No general photo/file attach.
7. **Two card vocabularies** (`ChatCard` vs v5 `ClientCards`), the first English-only. Risk of drift and untranslated cards in the dock.
8. **Skin seam is implicit**: `if (card)` props (`card`, `surfaceMode`, `cardIntro`) thread through `MiniChatPanelColumn`. Folio/Gridline cannot get their own skin without more branches.
9. **Notification and Agenda/Money landing** unverified end to end.
10. **a11y / 390px** has no recorded matrix.
11. Interactions (reply, reactions, voice) not in the guest chat; lowest priority, optional.

## 5. Recommended base engine

Keep the **guest dock** (`MiniChatPanelColumn` + `TalentProfileChatLauncher` + `guest-chat-actions`) as the single engine, rendering
**Messages v5 client cards** (`components/messages-v5/client`) for every typed card. Do not build a new engine and do not
promote `ChatCard`. Rationale: it is the only implementation with identity, claim, resume, catalog, details chips, status,
thread switching, gate, and the v5 payment/offer cards; the card skin already proves it can be reskinned without losing function.
`/c/[inquiryId]` stays as the full-page view of the same thread (same v5 renderer, same actions).

## 6. ChatSkin contract (proposal)

A skin is data plus slot components. It may change appearance and layout arrangement. It may NOT unmount a capability; the engine
owns visibility rules (switches, flags, plan), skins own looks.

```ts
type ChatSkin = {
  id: "standard" | "card" | string;          // chat.variant token value
  tokens: {                                   // all resolve to CSS vars on the frame, light + dark
    ink; muted; surface; bg; line; accent; accentInk; danger;   // --cc-*
    radius: { frame; bubble; pill; control };
    font: { body; display };                  // from site theme fonts
    density: "comfortable" | "compact";
    motion: "full" | "reduced";               // reduced-motion respected by default
  };
  layout: "floating-card" | "docked-panel" | "sheet-first";   // desktop arrangement
  expanded: "two-pane" | "single-column";
  mobile: "bottom-sheet" | "fullscreen";                       // required, 390px tested
  slots: {                                    // each OPTIONAL; engine supplies a default
    Frame; Header; Intro; ServicesView; AskFooter; Nav; StatusLine; Launcher; HelpBubble;
  };
};
```

Rules: (1) `paletteFor(skin.tokens)` replaces `paletteFor(surfaceMode)`; no hex outside the token table. (2) Slots receive
engine state as read-only props and call engine callbacks; they never read or write thread data (as CardDockPanel already states).
(3) A conformance test renders every registered skin against a capability checklist (the matrix rows above) and fails if any
action control is missing. (4) Registry: `chat.variant` stays the selector; a Design sets a default skin; per-site token overrides.

## 7. PR-by-PR migration plan

Each PR is small, flagged where it touches live behaviour, and contains tests. Order is by owner risk (money first).

1. **PR-A Skin contract, no behaviour change.** Add `ChatSkin` type + registry (`standard`, `card`), route `paletteFor`, frame, header, intro through it. Snapshot/parity tests (`skin-parity.render.test.tsx` already exists) must stay byte-identical for both skins.
2. **PR-B Capability conformance test.** Static + render test that every skin exposes: composer, catalog entry, details chips, status line, claim email, thread switcher, pay/offer cards, close/expand. Fails on a missing function. This enforces the owner rule permanently.
3. **PR-C Offers + Pay + Paid truth in the dock.** Prove accept/decline and pay link in dock (not only /c); Paid only after webhook; `?order=` cold-load resume. Includes live QA on a prod build on Jor.
4. **PR-D Truthful booking from availability** (instant-book talents): one slot picker from real availability in the dock and card skins; status wording tied to server state.
5. **PR-E One card vocabulary.** Route `MiniChatMessageBubble`/`GuestNextStep` through v5 client cards; keep `ChatCard` admin-only, localise its literals or retire its guest use.
6. **PR-F Guest reschedule/cancel** as v5 change requests (guest asks, talent approves); reuses `ClientChangeCard`.
7. **PR-G Attachments** (photo/file) in `MiniChatComposer` with size/type limits and moderation; reuse look-image pipeline.
8. **PR-H Notifications + landing audit.** Trace guest message to talent notification, Messages v5 inbox, Agenda, Money; fix holes; add an end-to-end test.
9. **PR-I a11y + 390px pass** across both skins (focus trap, aria-live for new messages, reduced motion, 390px screenshots as evidence).
10. **PR-J Tips** after a payments decision (talent as merchant, Stripe US/MX).
11. **PR-K Skins for Folio and Gridline** as pure `ChatSkin` entries (tokens + at most layout), proving the contract. Note: no theme work until the factory chat is done (standing owner rule), so schedule after that gate.
12. **Optional PR-L** lift reactions/reply/voice from `chat-interactions` into the guest engine if the owner wants parity with admin.

AI assistant: out of scope for the engine rebuild. If wanted later, it is a separate decision: an LLM that only drafts replies for the
talent to approve, grounded on her catalog and real availability, with a hard guardrail that bookings, quotes, and prices come only
from server tools. Today none exists, and the support-chat routes must not be reused for it.

## 8. Open questions for the owner

- Tips: yes/no and who is merchant of record.
- Should the guest be able to reschedule directly (instant) or only request (talent approves)?
- Is a talent-draft AI assistant wanted on the front chat at all?
