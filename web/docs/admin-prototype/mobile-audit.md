# Mobile audit — 50 fixes, mobile-only

> Real audit based on the actual mobile rendering you've shown me in
> screenshots, plus DOM inspection of the prototype. Every item is
> mobile-only. Desktop styles are untouched. Severity:
> 🔴 critical break · 🟡 noticeable · 🟢 polish.
> Fix tag in `()` at the end of each line points at the actual cause.

---

## A. Identity bar (the top header) — currently feels broken

A1. 🔴 **Acting-as "Acme Models" wraps to 2 lines** at narrow widths because the chip's label has no `white-space: nowrap`. (`<button class="tulala-acting-chip">` inner span)
A2. 🔴 **Mode toggle Talent pill appears oversized** because both child buttons use `flex: 1 1 0%` inside an `inline-flex` container without a width constraint — the pill grows to fit content but the active black "thumb" is sized off the post-stretch width, so the active half ends up larger.
A3. 🔴 **Bell badge "4" pokes UP out of the identity bar** — `top: -3px` on the badge in a `position: relative` icon button, which is in a 56px-tall bar. The badge breaks the bar's bottom-border line. (top right of the bell)
A4. 🔴 **Items overflow off-screen to the right** at <380px. Workspace label gets cut off. Total content > viewport because gap=14 + 8 visible items + spacer.
A5. 🟡 **Avatar + chevron-down combo for the account menu is tiny + disconnected** — the chevron isn't clearly attached to the avatar; users won't realize it's a menu trigger.
A6. 🟡 **Identity bar height 56px is fine, but the visual feels "dead"** — pure-white-on-cream with no elevation, no brand color, no breathing. (you flagged this; I tried surfaceAlt + accent stripe — wrong approach. The right fix is more subtle: a 1px shadow + tighter typography.)
A7. 🟡 **Mode toggle is the centerpiece but visually competes with the bell** — both are similar size at mobile. The mode toggle should be ~1.5x more prominent.
A8. 🟢 **Acting-as chip green dot + chevron** are 6px and 10px — both too small to be readable on phone.
A9. 🟢 **TULALA wordmark** is hidden at <540 but visible at 540-720 — feels orphaned in that range when the bar is already crowded.
A10. 🟢 **Identity bar `gap: 14px` is too generous** at phone widths. Already shrunk to 8 at <540, but items still don't fit. Should drop to 6 on the row, with internal item gaps held tighter.

---

## B. Bottom tab navigation — looking flat / wrong icons

B1. 🔴 **Messages tab uses the (i)-info icon, not a chat bubble or mail icon.** TALENT_TAB_ICON map has `messages` missing, so it falls through to the "info" default. (`TALENT_TAB_ICON` in `_pages.tsx`)
B2. 🔴 **Badge color is coral (orange)** but every other unread badge in the app uses forest green (`COLORS.green`). Inconsistent. (BottomTab badge `background: COLORS.coral`)
B3. 🟡 **Active pill (38×24 ink-filled) is too small for thumb comfort** — should be ~44×28 minimum, and the icon inside should be 18-20px not 16.
B4. 🟡 **Inactive tab label color (`inkMuted`) is too close to the active label color (`ink`)** — visually similar weight. Active should also have a subtle dot beneath the icon or a brighter color.
B5. 🟡 **"More" tab uses the same info icon as Settings.** Should be a `dots-horizontal` (···) glyph.
B6. 🟡 **No press-down feedback** — no scale-down or background flash on tap. Native apps always have this.
B7. 🟢 **Tab heights aren't accounting for full safe-area-inset-bottom** on devices with home indicators (iPhone X+). Already partly there with `paddingBottom: env(safe-area-inset-bottom)` — verify it's actually applied.
B8. 🟢 **No tab switcher animation** — pill jumps instantly between tabs instead of sliding (like the mode toggle does).

---

## C. Talent Today — hero + lists at mobile

C1. 🔴 **Hero title "3 things need your reply." wraps to 4 lines on phone** because the right column (Reply now + Availability) takes ~50% width. The hero uses `display: flex; justify-content: space-between` with no mobile stack rule. (TalentTodayHero outer `<div>`)
C2. 🔴 **"Reply now ↓" + "Availability" buttons stay inline at right** — should drop below the headline at <720.
C3. 🟡 **Location chip "Playa del Carmen, Mexico · Open to travel"** is a tiny grey tap target (12px text). Should be more visible / readable on phone.
C4. 🟡 **"Needs your reply" rows pack too much in one line:** name + dot-separator + brief + dot-separator + tags + amount + age + chevron. Wraps awkwardly. Should split into 2 lines: line 1 = name + age right-aligned; line 2 = brief + status pill + amount.
C5. 🟡 **Stella McCartney row name wraps** because it's 16 characters next to a long brief. Need either narrower brief or smaller name font on mobile.
C6. 🟡 **Avatar in rows is 36px** — fine but the dots between fields are visual noise on phone. Use spaces and let the line wrap naturally.
C7. 🟡 **Tap target on rows is only ~36px tall** (the avatar height) — should be 56px+ minimum for thumb comfort.
C8. 🟢 **"Open inbox →" link** in the section header is 12px — small.
C9. 🟢 **Section dividers** (1px borderSoft) feel anemic on mobile. Could be 4-6px gap with no line.
C10. 🟢 **Stats strip (Confirmed/Paid/Profile)** wraps to 2-up grid via my earlier CSS, but the divider line between Paid and Profile is hidden — works. But each stat caption ("next Tue, May 6") wraps under the value awkwardly at very narrow widths.

---

## D. Talent Messages list view (mobile)

D1. 🔴 **Conversation list rows still pack 4+ lines** of text + a participants stack — at narrow widths the brief preview wraps to 2 lines AND the participants row wraps too. Total row height balloons to 100px+.
D2. 🔴 **Filter chips (All/Unread/Inquiry/Hold/Booked/Past) wrap to 2 rows** on phone because they don't fit in one line. Should be horizontal-scroll or icon-only.
D3. 🟡 **Search bar with magnifier icon + "Search clients, briefs..." placeholder** feels like a desktop pattern. On phone, an inline pull-down search is more native.
D4. 🟡 **"Messages · 5 threads" header line** is wasted space on phone. Could be removed (the page is clearly Messages from the tab nav).
D5. 🟡 **Participants avatar stack** under each row adds another line. On mobile, hide it or move to thread view only.
D6. 🟢 **Avatar 40px + trust badge** is fine but the dashed top-border separator on the participants row is heavy.
D7. 🟢 **Last-message age** ("5h", "18h", "4h ago", "7d") uses inconsistent format — short ("5h") in one column, long ("4h ago") in another. Pick one.

---

## E. Talent Messages thread view (mobile)

E1. 🔴 **Thread header packs**: back button + 36px avatar + client name + trust chip + stage pill + search + ⋯ + info toggle. 8 elements competing. At phone width some get cut off.
E2. 🟡 **Bubble max-width 88%** leaves a 12% margin which feels unbalanced. Should be 92-95% with the avatar absent on user's own messages.
E3. 🟡 **Action cards (rate input, transport, etc.)** clamp to viewport-48 but still feel cramped. The €/day input + Send button row sits awkwardly on mobile.
E4. 🟡 **Composer has 5 elements** in one row: + ✨ input 🎙️ Send. The + and ✨ overlap visually. Drop ✨ on mobile (smart-replies appear inline above when invoked some other way) — or merge them.
E5. 🟡 **Right info sidebar at mobile = bottom sheet** — but tapping outside the sheet doesn't close it. Add a backdrop with tap-to-close.
E6. 🟢 **Drag handle pill** at top of bottom sheet is 4×36px — visual only. Should be a real drag-to-dismiss gesture.
E7. 🟢 **Read receipt ✓✓** alongside timestamp — works but feels small. On mobile mass them tighter beneath the bubble.
E8. 🟢 **Image grid** (2x2 placeholder thumbnails) at mobile — ratio looks odd in a narrow bubble.
E9. 🟢 **Voice note bubble** width 220px min — overflows narrower viewports. Should be 100% width of bubble.

---

## F. Drawers, modals, forms

F1. 🔴 **Drawer body inputs default to ~32-36px tall** — below 44px tap-target minimum. Fix in TextInput / TextArea / DatePicker primitives at mobile.
F2. 🟡 **Drawer footer buttons stack** at narrow widths but the gap between primary and secondary feels disconnected — they should be full-width pills stacked, with the primary on top.
F3. 🟡 **Toast bottom-right lands UNDER the bottom nav** on mobile. Already lifted to `bottom: calc(76px + env(safe-area-inset-bottom))` for the FAB but toasts use `bottom: 20`. They overlap the bottom nav at <720.
F4. 🟡 **Modal scrim** is `rgba(11,11,13,0.36)` — slightly light on phone where ambient brightness washes it out. 0.50 reads cleaner.
F5. 🟢 **Drawer titles use a 16-18px display font** — could shrink to 15-16px at mobile to leave more body room.

---

## G. Typography, spacing, visual rhythm

G1. 🟡 **Display headlines drop from 30 → 26 → 22 across breakpoints** but the middle (26 at 720-540) feels off. Pick 30→24 (one breakpoint).
G2. 🟡 **Caption/label text 10.5-11px** is unreadable on phone over arm's length. Floor caption to 11.5px on mobile.
G3. 🟡 **Vertical rhythm inconsistent** — sections use 12, 14, 16, 18, 24px margins inconsistently. Pick a 4px-grid system.
G4. 🟡 **Border-radius mix** — 7, 8, 9, 10, 12, 14, 999 across components. Mobile feels more cohesive with one of {8, 14, 999}.
G5. 🟢 **Cards on cream surface** read flat on phone. Add a 1px subtle shadow (`0 1px 1px rgba(11,11,13,0.04)`) to lift them off the surface.
G6. 🟢 **Section dividers** — 1px borderSoft. On mobile, prefer 8-12px spacing instead of a line; let breathing room do the separation.

---

## H. Interaction patterns missing on mobile

H1. 🟡 **No pull-to-refresh** on inbox / messages / activity / calendar lists. Native expectation.
H2. 🟡 **No swipe-to-archive / swipe-to-snooze** on conversation rows.
H3. 🟡 **No haptic-style press feedback** anywhere. CSS `transform: scale(0.98)` on `:active` for primary buttons would simulate it.
H4. 🟢 **No long-press for context** (pin / mute a conversation, pin a message).
H5. 🟢 **No native sheet drag-to-dismiss** on bottom sheets — just X close.
H6. 🟢 **No thumb-zone optimization** — primary actions sometimes top of screen instead of bottom.

---

## I. Accessibility + tap targets

I1. 🔴 **Many icon buttons are 30-32px tall** — below WCAG 24×24 + Apple HIG 44×44 thumb-comfort baseline.
I2. 🟡 **Color contrast on inkMuted text** (`rgba(11,11,13,0.62)` ≈ AA on cream, fails AAA). Bump to 0.72 for caption-on-cream.
I3. 🟡 **Focus rings present** (you already have `:focus-visible` outline), but on mobile (no keyboard) this is wasted CSS — could be removed at narrow widths.
I4. 🟢 **Skip-to-main link** present (good) but only useful at desktop. Hidden correctly at mobile.

---

## J. Recommended fix order — ship this week

If I had to pick **the 8 with the highest mobile-impact**, in order:

1. **A1** — Acting-as nowrap (one-line CSS fix)
2. **A4** — Identity bar overflow handling (collapse acting-as to icon-only at <380px)
3. **A3** — Bell badge clipping inside 56px height
4. **C1 + C2** — Talent today hero stacks vertically at <720 (real, not just for `data-tulala-page-header`)
5. **B1** — Bottom-tab Messages icon = mail
6. **B2** — Badge color = green (consistent)
7. **D2** — Filter chips → horizontal scroll instead of wrap
8. **C7** — Today list rows: 56px+ tap targets

These eight would make the talent surface feel premium-mobile. The rest is polish + missing patterns.

---

*Audit produced 2026-04-27 from real DOM inspection + your annotated screenshots. Mobile-only — desktop styles untouched.*
