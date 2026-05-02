# Decision points — default positions

> Companion to `talent-execution-checklist.md`. Each decision point (DP)
> below has a default position taken in the prototype so engineering can
> ship the surfaces without waiting for product. All defaults are
> reversible — change them and the affected surfaces re-render
> accordingly.

---

## DP1 — Off-platform earnings → 1099 reporting?

**Default position**: ON-platform earnings auto-reported by Tulala.
Off-platform earnings (logged via "Log work") are self-declared by the
talent and surfaced in the year-end summary as a separate column.
In-kind / gift earnings show in the same view but aren't included in the
cash total.

**Why**: matches what most marketplaces do (Fiverr, Upwork, Etsy);
avoids surprising talents at year-end with reports they didn't expect;
keeps Tulala's tax exposure scoped to platform-mediated transactions.

**Lives in**: `TalentTaxDocsDrawer` · "About off-platform & in-kind"
indigo info card.

---

## DP2 — Pause-mode semantics on Reach (vs off)

**Default position**: Paused = listed but not accepting new inquiries.
Existing inquiries continue. Resuming flips back to live without losing
distribution.

**Why**: separates "I'm taking a breather" (paused) from "I'm done with
this channel" (off). Talent can pause for a week without losing their
hub-vetting status; off requires re-applying.

**Lives in**: `ChannelRow` pause-mode local state · 3-state UI
(Live/Paused/Off).

---

## DP3 — Trust-score impact preview to talent

**Default position**: Show the impact inline on the channel toggle as a
coral warning copy ("Heads up: {channel} isn't Tulala-verified.
Inquiries may include unvetted clients. Adjust your contact policy if
needed.")

**Why**: setting the expectation BEFORE the inquiry lands beats
explaining it after the fact in the inbox. Coral = "your move",
non-blocking.

**Lives in**: `ChannelRow` · `showTrustWarning` block.

---

## DP4 — Friend referral attribution model

**Default position**: First-touch attribution. The talent who's invite
link a new talent signs up through gets credit for life. €50 to inviter
+ €50 to invitee on the invitee's first booking close.

**Why**: simplest model, matches Dropbox / Notion historical referrals;
encourages honest sharing rather than gaming.

**Lives in**: `TalentReferralsDrawer` · "When a talent you invite closes
their first booking, you both earn €50 in payout credit."

---

## DP5 — AI reply data privacy default

**Default position**: Voice replies + AI suggestions are processed
server-side; transcripts stored alongside audio. Talent can delete
either independently. Suggestions are NOT used to train a global model
without explicit opt-in.

**Why**: explicit-opt-in beats default-on for training data. Gives the
talent meaningful control without forcing them through a privacy maze.

**Lives in**: `TalentVoiceReplyDrawer` · description copy and the
"transcript edit" affordance.

---

## DP6 — Calendar week/day view priority

**Default position**: Built. Week + Day views ship in the prototype as
view-mode toggles alongside Month. Same event source, progressive zoom.

**Why**: low-cost addition once the event model exists; closes a real
gap in the workflow for talents with multi-day shoots.

**Lives in**: `CalendarPage` view-mode toggle · `CalendarWeekView` ·
`CalendarDayView`.

---

## DP7 — Agency exclusivity switch-window length

**Default position**: 30 days. After a talent leaves an exclusive
agency, they can't be re-added by a NEW exclusive agency for 30 days
(but can rejoin the original within 14 days). Prevents agencies from
poaching talent mid-cycle.

**Why**: matches industry norms in fashion (NDA + non-compete windows);
short enough that talent isn't punished for one bad fit.

**Lives in**: `talent-leave-agency` drawer copy + agency-exclusivity
binding spec saved to memory (`project_agency_exclusivity_model.md`).

---

## DP8 — Free → Studio retroactive exclusivity?

**Default position**: NO retroactive exclusivity. A talent can be on N
agencies on Free; when an agency upgrades to Studio they get
auto-exclusivity going forward but the existing roster stays as it is.
The talent gets a one-tap "leave" affordance for any agency they don't
want exclusive.

**Why**: fair to existing relationships; avoids billing-event surprises.

**Lives in**: `project_agency_exclusivity_model.md` (memory).

---

## DP9 — Per-agency commission override allowed?

**Default position**: NO override at the talent level. Each agency has
ONE contracted commission rate that applies to all bookings routed
through them. Per-agency rate is set at the agency-onboarding level.

**Why**: simpler payout reconciliation; talent doesn't have to
remember "Acme takes 18% but Bumble takes 22% on my Lookbook gigs".

**Lives in**: `TalentMultiAgencyPickerDrawer` · "Each agency keeps its
contracted rate" indigo info card.

---

## DP10 — In-kind / gift earnings tax requirement

**Default position**: Surfaced in the year-end summary as a separate
column ("In-kind") but NOT reported to tax authorities. Caveat note in
the tax-docs drawer instructs talents to consult a local advisor for
their jurisdiction.

**Why**: reporting in-kind correctly varies wildly by country
(Spain ≠ US ≠ UK); cleaner to surface the data and let the talent
handle local compliance than to guess and get it wrong.

**Lives in**: `TalentTaxDocsDrawer` · "About off-platform & in-kind"
indigo info card.

---

## DP11 — Trust tier labels

**Default position**: Style B (trait-based labels). Basic / Verified /
Silver / Gold — descriptive, ladder-implying, no membership-club
connotation.

**Why**: tested cleaner than the Membership-style A ("Newcomer /
Trusted / Established / Premier") which felt too marketing-y; tested
cleaner than icons-only C which lost meaning at small sizes.

**Lives in**: `ClientTrustChip` · `ClientTrustBadge` · binding spec
`project_client_trust_badges.md` (memory).

---

## How to override a default position

1. Override the relevant copy/logic in the listed component.
2. Update the `Lives in` reference here to point at the new
   implementation.
3. Update the binding spec in memory if applicable.
4. The `talent-execution-checklist.md` items that depend on the DP get
   un-blocked automatically since they're shipped against the default.

*Last updated 2026-04-26.*
