# Guest Message Panel — 360 RE-AUDIT (2026-07-11)

Companion to `guest-message-panel-360-audit-2026-07-09.md` (baseline **4.5/10**).
Scores the product as shipped to **production** after the DOCK v2 program
(PRs #752, #754, #760, #765, #767, #774, #779, #781, #782, #783).

Scoring rule (owner standard): honest per-dimension, **never summed**; overall
is a judgment of the whole, not an average of the parts.

## 1. Verdict

**Overall: 8/10 as a client operating system** (was 4.5/10). The engine was
always good; the surface on top of it is now trustworthy and reads as a
concierge, not an engineering artifact. Every P0 from the baseline is fixed at
the seam, the redesign the audit recommended shipped in full, and several
owner-driven improvements went beyond the original plan (AI auto-fill revived,
quick-summary cards, favorites folded into the lineup, add-vs-separate chooser,
in-chat thread switcher). What holds it back from 9-10 is deliberately out of
scope: the hub's cross-tenant money layer is frozen behind unresolved payment
P0s, and a few cold-resume/analytics edges remain.

Per-dimension (honest, not summed):

| Dimension | Was | Now | What moved it |
|---|---|---|---|
| Data correctness | 3.5 | **8.5** | One-draft resume; pill honest end-to-end; freeze-on-send server-enforced (incl. cart projection); contact gate; note coalescing; separate-inquiry draft-safety; AI extraction revived (was silently dead in prod) |
| IA / product model | 4 | **8.5** | 14 front doors → one canonical launcher; 2 identical projects → distinguishable cards (status + date/place/budget meta + faces); favorites folded INTO the lineup; one favorites surface (heart → dock); add-vs-separate chooser; in-chat switcher |
| Visual design / craft | 5 | **8** | Full DOCK v2: bigger panel, slim header, bottom-tab nav, calm conversation, compact 1-bubble receipt, de-collided pill, one modern-font system (owner-confirmed) |
| Surface consistency | 4 | **8** | Launcher on home/directory/profile/builder/hub; show_on_home; honest pill everywhere + unseen-reply pulse; single type system |
| Hub readiness | 2 | **7** | Roster-load fix; Concierge branding; launcher on hub landing; header-forwarding fix. Cross-tenant money flows still frozen (not this program) |
| Config / tenant control | 6 | **7.5** | show_on_home flag; settings drawer; reach into builder-home pages |

## 2. Baseline P0s — all resolved

- **P0-1 duplicate drafts** → one-draft resume re-gated on `interpreted_query.selected_ids`; live-proven single draft across home/directory/profile.
- **P0-2 pill lies "Inquiry sent" on a draft** → `draft` mapped to its own thread status end-to-end; the `resume_draft` / draft states now fire. Extended: unseen-reply `replied` state (#782) so the pill also stops *falsely* claiming a reply the visitor already read.
- **P0-3 edits mutate sent inquiries** → `captureGuestChip` refuses non-draft writes; the cart-selected-ids projection is now draft-only for guests too (closed a bypass found in live QA).
- **P0-4 expanded draft has no send + scroll leak** → always-visible Send in both modes; `overscroll-behavior: contain` throughout; Expand relegated to the ⋯ menu.
- **P0-5 hub launcher broken/absent** → roster fix + Concierge mount + apex header-forwarding fix (#754).
- **P0-6 server accepts contactless guest messages** → `shouldRefuseGuestSend` gate before the insert.

## 3. Beyond the original plan (owner-driven, shipped)

- **AI auto-fill actually works** — the extractor was silently dead in prod (Anthropic retired the pinned default model; every fail-open path returned nothing). Fixed to `claude-sonnet-5`; scan reads the unsent composer draft + auto-runs at first send; prompt anchored to today's date and taught guests≠talent-count. Live-proven: one sentence fills date/location/budget/type/talent-count.
- **Quick-summary inquiry cards** — icon meta-row (date · location · budget), a distinct solid **Booked** chip, lineup portraits, human titles ("Wedding · Aug 14"), text-only previews.
- **Compact receipt** — the 5-section post-send card collapsed to one calm truthful bubble.
- **Lineup = favorites hub** — Saved shelf with un-save hearts + drag-to-inquiry + "Start an inquiry with these"; the site-header heart now opens this one surface (legacy modal retired).
- **Profile CTA chooser** — add-to-current vs separate inquiry, draft-safe by construction (new draft minted server-side first; old draft parked + autosaved).
- **In-chat thread switcher** — header title "Agency ▾" slides the inquiry list over the chat; one-thumb switching + "Start a new inquiry".
- **Details moved to the header** — a compact sliders icon with a live N/6 badge, reclaiming the composer real-estate.

## 4. What still holds it back (honest)

- **Hub cross-tenant money layer is frozen** (unresolved payment P0s in the XTENANT program). Hub work here was copy/branding/mount only; deeper cross-agency inquiry fan-out + payouts are gated elsewhere. This is the single biggest cap on the score.
- **Cold-resume Projects population** — a returning guest's Projects list doesn't always populate on a cold load until the panel is reopened (noted follow-up; the view renders correctly with data).
- **A11y is dismissal-complete, not trap-complete** — new overlays close on Escape + scrim/outside-click, but there is no full focus-trap/focus-return yet.
- **Analytics coverage is partial** — conversion events exist on the primary points (start_inquiry with cta_path, send, lineup add/remove) but not yet on every switcher hop or drag.
- **Residual cosmetics** — old "Added N talent" history rows; orphaned pre-redesign files (InquiryDetailsRail/InquiryDetailRow/DraftPrivacyBanner) pending a cleanup lane.

## 5. Bottom line

The baseline called this "engineered, not concierge," with a good engine under
an untrustworthy surface. The surface is now trustworthy: it resumes one draft,
tells the truth on every pill, freezes sent inquiries, fills itself with AI,
reads its cards like a receipt, and switches threads in one thumb-reach. **8/10**
— a real client operating system, held short of 9-10 only by the frozen hub
money layer and a short list of named edges, none of which are rewrites.
