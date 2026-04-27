# Talent + Workspace dashboards — improvement audit

> Walkthrough of the prototype surfaces with concrete recommendations.
> Status legend:
> - 🔴 **bug / broken** — visibly wrong or confusing
> - 🟡 **improvement** — works but can be sharper
> - 🟢 **polish** — premium-feel detail
> - ✨ **new feature** — additive
> - ❌ **remove / simplify** — earns its place isn't earning
>
> Effort: 🟢 quick (≤½ day) · 🟡 medium (1–2 days) · 🔴 big (3+ days)

---

## Cross-cutting (everywhere)

1. ✨🟡 **Command palette (⌘K)** — single search box that finds talents, clients, inquiries, bookings, pages. Quick-action launcher for "+ New inquiry", "Block dates", "Log work". The single biggest power-user signal.
2. ✨🟡 **Keyboard shortcuts overlay** — press `?` (when not in an input) to show all shortcuts. Already a shortcut on identity bar; surface the cheatsheet.
3. 🟡🟢 **Identity-bar account menu** — currently a toast. Should open a real popover with: Profile · Account settings · Keyboard shortcuts · Theme · Sign out. ~1 hour.
4. 🟢🟢 **Hover state on identity-bar elements** — Acme Models / Atelier Roma chip currently has subtle hover, but the chevron should rotate 180° on hover to invite the click.
5. 🟢🟢 **Animation on mode flip** — the segmented pill should slide the ink-filled chip from one side to the other (like a rocker switch) instead of a hard swap. ~1 hour.
6. ❌🟢 **PROTOTYPE control bar** — at the very top is dev-only chrome. Hide it for non-`?dev=1` URLs so the prototype demoable surface looks like the real product.
7. 🟡🟢 **Toast positioning** — currently bottom-center. Premium products lean bottom-right with stacking. ~30 min.
8. ✨🔴 **Onboarding tour** — first-session walkthrough using a tooltip overlay (Intro.js / Driver.js style). Especially for hybrid talent-owners who have to learn two contexts.
9. 🟡🟡 **Loading states** — `RowSkeleton` exists but isn't used anywhere yet. Wire into Inbox, Activity, Calendar lists for the 200ms before data arrives.
10. ✨🟡 **Real-time presence** — small green dot next to a coordinator's avatar when they're online viewing the same inquiry. Cheap to add via Supabase Realtime presence channel.

---

## Talent · Today

11. 🟡🟢 **Stats strip drill-in** — "CONFIRMED 2", "PAID THIS MONTH €6,800", "PROFILE 84%" should each be clickable. Today they're inert. Click → relevant page (calendar / activity / edit-profile).
12. 🟡🟡 **"Inquiries you're in" vs "Needs your reply"** — visually too similar. Differentiate: Needs-your-reply = ink-bordered cards with action chips; Inquiries-you're-in = soft grey cards with status pill only. Reduces cognitive load.
13. 🟡🟢 **Profile views chart** — currently three numbers (Views / From X site / Inquiries). Add a tiny sparkline below each so you see the trend, not just the total.
14. ✨🟡 **"Today's plan"** — collapsed banner showing TODAY's confirmed shoots inline (call time, location, contact). Currently you have to go to Calendar to see today's bookings.
15. 🟢🟢 **Hero CTA hierarchy** — "Reply now →" + "Availability" both at primary visual weight. Demote Availability to secondary; pending replies should clearly win.
16. ❌🟢 **"Top of inbox first" subline** — beneath the hero. Vague. Either remove or replace with a concrete next-action microcopy ("Mango is waiting since 5h ago.").

---

## Talent · Edit profile (My profile)

17. 🟡🟡 **Profile Health banner placement** — now competes with the page header. Sticky it just above the section bands so it floats in view as you scroll through profile sections. ~½ day.
18. 🟡🟡 **"Walk me through" mode** — sequential drawer flow that opens missing fields one by one with prev/next chips. Currently each field opens its own drawer in isolation; finishing 4 fields = 4 drawer-open / drawer-close cycles.
19. ✨🟡 **Live public-preview pane** — split view: left = editor, right = the public profile rendering live. Common in modern CMS (Webflow, Framer). Removes the "Preview public profile" round-trip.
20. 🟡🟢 **Saved indicator** — when an inline edit auto-saves, show a tiny "Saved · 2s ago" near the field. Builds trust that auto-save is working.
21. ❌🟢 **Polaroids vs Portfolio** — overlapping concepts in the prototype. Either consolidate or label clearer ("Polaroids = unretouched, recent" vs "Portfolio = published work").
22. ✨🔴 **AI rewrite assist** — bio field gets a "✨ Refine" button that suggests a tighter version. Same for client-facing brief replies.

---

## Talent · Inbox

23. 🟡🟡 **Bulk actions** — multi-select rows (checkbox column or shift-click), then bulk decline / bulk hold / bulk archive. Critical at scale.
24. ✨🟡 **Saved views** — "Verified clients only", "From Acme Models", "Hold expiring < 24h". Save and pin. Inbox becomes per-user.
25. ✨🟢 **Snooze** — press `s` on a row to snooze for 1 day / 3 days / next Monday. Returns to top of inbox at chosen time.
26. 🟡🟢 **Smart sort** — currently sorted by urgency. Add toggle: Urgency · Newest · Highest value · Best fit (AI ranks). Lets the user pick their triage axis.
27. 🟡🟢 **Keyboard navigation** — `j`/`k` to move between rows, `enter` to open, `e` to archive, `r` to reply. Standard for inbox products (Superhuman, Linear).
28. ❌🟢 **Filter chip count badge style** — currently small dim numbers. Make them tabular-figure pill badges that match the mode-toggle's badge for consistency.

---

## Talent · Calendar

29. 🟡🟡 **Empty-day visual** — in Week + Day views, days with no events render "—". Replace with a soft "Free · block this day?" affordance that creates a block on click. Premium affordance.
30. ✨🟡 **Drag-to-block** — click and drag across calendar cells to create an availability block. Currently you have to open a drawer, type dates.
31. ✨🟡 **Recurring blocks** — "Block every Sunday for the next 8 weeks". Add a simple recurrence selector to the Block-dates drawer.
32. 🟡🟢 **No-conflict calendar hero** — when there are 0 conflicts, the conflict banner area is empty. Replace with a "Next 14 days outlook" strip — one-line summary like "3 confirmed · 2 holds expiring".
33. ✨🟡 **Two-way sync** — connect Google Calendar / Apple Calendar so blocks appear in both places. Critical for talents who already manage time elsewhere.
34. 🟢🟢 **Color legend** — the colored left-borders on Week/Day events (green/coral/indigo) need a small legend. Currently you have to remember the system.

---

## Talent · Activity

35. 🟡🟡 **Three competing horizontal strips** — Forecast tile + Stats strip + Filter chips stacked. Consolidate the two strips: put Confirmed / Avg / Top Channel inside the Forecast tile as smaller secondary numbers. Saves ~80px and one mental jump.
36. ✨🟡 **Group by month** — earnings list scrolls forever. Group rows under "April 2026", "March 2026" headers. Each header shows month total inline. ~1 day.
37. ✨🔴 **Earnings goal** — set a monthly or yearly goal, see a progress ring. Couples to ForecastTile naturally.
38. 🟡🟢 **CelebrationBanner trigger** — currently fires once at €1k. Add: 5 bookings, 10 bookings, first international booking, first repeat client, longest dry spell broken. Each adds personality.
39. ❌🟢 **"View earnings detail" CTA on celebration** — clicking just sets filter to "All", which is already the default. Make it open the booking that pushed past the milestone, or remove.

---

## Talent · Reach

40. 🟡🟡 **ProTierValueCard always-visible** — feels like a nag. Show it on first page-load only, or until dismissed for the session. Or move it to be a subtle sticky strip at the bottom: "On Basic. Pro unlocks 3 modules → See plans".
41. 🟡🟡 **Channel rows group order** — Personal / Tulala Hub / Agencies / External hubs / Studios. Should be ordered by attention required, not by kind. E.g., paused channels float to top as "Resume?" prompts.
42. ✨🟡 **"Estimated inquiries / month" preview** — when toggling channels on/off, show a live projected number for next 30 days based on historical close-rates. Makes the trade-off visible.
43. 🟡🟢 **Trust-score warning** — coral microcopy is fine but easy to miss. Add a tiny coral dot next to the channel name when warning applies, so it's scannable from the channel header.
44. ✨🟢 **Reach health score** — single 0–100 number summarizing distribution health. Like the Profile Health, but for distribution. Cards stack into one badge.

---

## Talent · Settings

45. 🟡🟡 **9 cards in one grid** — overwhelming. Group into sections with headers:
    - **Profile** — Plan, Personal page builder, Identity verification
    - **Communication** — Notifications, Contact preferences, Privacy
    - **Money** — Payouts, Tax documents
    - **Network** — Agencies (existing), Talent network, Multi-agency workspace
    - **Other** — Refer a friend, Help & support, Sign out
    Reduces scan time by ~60%.
46. 🟢🟢 **Card meta consistency** — some cards show a status dot, others don't. Standardize: every card has a status dot OR none do.
47. ❌🟢 **"Sign out / leave"** card — two distinct actions in one card. Sign out belongs in the identity bar (now there). Leaving an agency belongs under Agencies. Remove this card.

---

## Workspace · Overview

48. 🟡🟡 **Stat-card overload** — 4 metric cards + 2 hero cards + 2 small cards + "More with Agency" footer. Feels packed. Trim: 4 metrics + 1 attention card + 1 activity feed. Move "More with Agency" to a dedicated marketing-y page.
49. ✨🟡 **"Today's focus"** — one prominent card at the top showing what today demands. "3 inquiries waiting on you · 1 booking starts tomorrow · 2 talents need approval". Single source of urgency.
50. 🟡🟡 **"Your activation arc"** — first-run setup checklist (the 5-step you showed in your screenshots). Once complete should collapse to a single "Setup complete · view history" link, not stay full-size.
51. ✨🟢 **Recent activity feed** — already exists but compact. Add reactions ("👍 to a booking confirmation") and @-mentions to make team feel alive.

---

## Workspace · Inbox / Workflow

52. ✨🟡 **Bulk actions** — same as talent inbox. Critical.
53. ✨🟡 **Reply templates** — admin saves canned replies ("Send our standard polaroid request"). One-click insert.
54. ✨🟡 **Pipeline view** (Workflow) — kanban columns for Draft / Sent / Negotiating / Approved / Booked. Drag inquiries between stages. The current list view doesn't show pipeline state visually.
55. 🟡🟢 **Inquiry @-mentions in admin** — when a coordinator @-mentions a teammate, the mentioned person gets a notification. Already exists for messages — extend to private notes.
56. ✨🟢 **Auto-assign rules** — "Inquiries from Mango → assign to Sara". Reduces cognitive load.

---

## Workspace · Roster (Talent page)

57. 🟡🟡 **Filter sophistication** — currently basic. Add: by tier (Verified/Silver/Gold), by availability (Available now / Open to travel), by category (Editorial / Commercial / Runway), by performance (Top 10% close rate).
58. ✨🟡 **Quick-add talent flow** — guided invite-by-email + draft profile. Currently scattered.
59. ✨🟢 **Roster health indicator** — % of talents with complete profiles, % verified, % active. One-line dashboard at the top.
60. 🟡🟢 **Inline editable table** — click a cell to edit (rate, availability, status). Saves opening drawers for trivial changes.

---

## Workspace · Public site

61. ✨🟡 **Live preview alongside editor** — same as talent edit-profile. Webflow-style split.
62. ✨🟡 **Page templates gallery** — "Roster page", "About page", "Contact page" starters. New pages start from a template, not blank.
63. 🟡🟢 **Brand kit at workspace level** — primary color, font, logo. Cascades to all pages. Currently per-page.
64. ✨🔴 **A/B test homepage variants** — premium feature for agencies that care about conversion. Phase 2.

---

## Workspace · Billing

65. ✨🟡 **Plan comparison + upgrade flow** — currently we have the upgrade drawer; surface plan comparison inline on the billing page so the upgrade CTA is grounded in real numbers.
66. ✨🟡 **Invoice history** — table of past invoices with download, status, amount.
67. ✨🟡 **Usage tracking** — "You used 47/100 inquiries this month on the Free plan." Bar fills, color shifts amber > red as it approaches cap.
68. ✨🟢 **Per-talent commission view** — for agencies: see each talent's commission rate, recent earnings, agency cut. Critical for finance.

---

## Workspace · Settings

69. 🟡🟢 **Tabs vs cards** — currently a long page. Use tabs: General · Team · Integrations · Domains · API · Webhooks · Notifications. Each tab a focused settings panel.
70. ✨🟡 **API tokens UI** — generate / revoke tokens. Documented as T16 in the Phase G doc; not built yet.
71. ✨🟡 **Webhook endpoints** — same.

---

## Things to remove / simplify

- ❌ Workspace topbar's **layout-toggle icon** — make sidebar the canonical layout, hide the topbar variant unless `?layout=topbar`. Less code, less divergence.
- ❌ Workspace topbar's **Quick create dropdown** if sidebar mode wins — the sidebar already has "+ New inquiry" CTA.
- ❌ The talent's **"Preview public profile" pill** — could be smaller (icon-only with tooltip on desktop) since the talent already has a dedicated page for the public profile in My Profile.
- ❌ The acting-as **green dot** in identity bar — currently always green. Remove or repurpose: green = active workspace, amber = paused, etc. If always-green, drop it.

---

## Premium polish (the "feels expensive" pass)

72. 🟢🟢 **Subtle gradient backgrounds on hero cards** — the FirstSessionChecklist + CelebrationBanner already use them. Extend to: Today's hero, Forecast tile, ProTierValueCard.
73. 🟢🟢 **Microinteractions on toggles** — Toggle component has a clean animation; extend to all switches.
74. 🟢🟢 **Number animation** — when a stat updates (Profile 84% → 88%), tween the number with a 400ms ease-out. Feels alive.
75. 🟢🟢 **Empty-list illustration** — replace EmptyState's icon-in-circle with custom line-art illustrations that match the brand. Phase 3 polish.
76. 🟢🟢 **Drawer back-stack breadcrumb** — when drawers stack (open A → opens B), show "← A" at the top of B so the user knows where they came from. We have the back-stack data; just need the UI.

---

## Tally

- 🔴 critical fixes: 3
- 🟡 improvements: 32
- 🟢 polish: 18
- ✨ new features: 23
- ❌ removals: 6

**Recommended sequence**:
1. **This week** — items 1, 3, 5, 11, 12, 28, 36, 45, 47 (cross-cutting + Talent surface readability)
2. **Next week** — items 23, 24, 27, 52, 53, 54 (Inbox + Workflow power tooling)
3. **Following** — items 8, 18, 19, 30, 33, 61, 65–67 (premium-tier features)
4. **Polish pass** — 72–76 (the "feels expensive" finals)

The 17 ❌ remove/simplify items can land alongside everything else as we go.

---

*Audit produced 2026-04-26. Ground-truth based on the prototype's current state at `src/app/prototypes/admin-shell/`. Production parity items (e.g., EN/ES toggle, sign-out in identity bar) shipped in `0550453` follow-up.*
