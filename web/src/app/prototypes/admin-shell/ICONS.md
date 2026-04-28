# ICONS.md — Tulala Icon Registry

> **WS-17.8** · Canonical list of every icon available in `<Icon name="..." />`, semantic use cases, and do's/don'ts.
> All icons are rendered as inline SVGs via `Icon` in `_primitives.tsx`. The underlying path library is **Lucide**.

---

## 1. How to use

```tsx
import { Icon } from "./_primitives";

// Basic
<Icon name="check" size={16} />

// With custom color and stroke weight
<Icon name="alert" size={14} stroke={2} color={COLORS.accent} />
```

**Rules:**
- Every icon-only button **must** have `aria-label="..."` on the button element.
- Never use an emoji as a substitute for a functional icon (emoji are OK in display/celebration contexts).
- Never inline a raw SVG — always go through `<Icon>`. If a path is missing, add it to `_primitives.tsx`.
- Size `14` is the default. Use `12` for inline/badge contexts, `16` for standalone, `20+` for empty-state illustrations.

---

## 2. Icon registry

### Navigation & direction

| Name | Visual | Use for |
|---|---|---|
| `arrow-right` | → | CTAs, "See all", links that navigate to a new surface |
| `chevron-right` | › | List rows with drill-down, sidebar active indicator |
| `chevron-down` | ∨ | Collapsible sections, dropdowns, sort controls |

**Do:** use `chevron-right` for in-page drill-down. Use `arrow-right` only when navigating away (to a new page/surface) or as an action indicator.
**Don't:** mix these on the same surface for the same semantic purpose.

---

### Actions & state

| Name | Visual | Use for |
|---|---|---|
| `x` | ✕ | Close a drawer/modal, remove a chip/tag, dismiss a banner |
| `check` | ✓ | Completed status, verification, checkbox ticked, success toast |
| `plus` | + | Add / create actions (new inquiry, new team member) |
| `archive` | 🗃 | Archive an inquiry, move to archive state |
| `lock` | 🔒 | Locked plan feature, password fields, restricted access |
| `external` | ↗ | Opens in new tab / external link |

**Do:** use `plus` for creation, not `arrow-right`.
**Don't:** use `x` for "delete" — `x` means dismiss/close. Destructive deletes should use a text button label.

---

### Communication & social

| Name | Visual | Use for |
|---|---|---|
| `mail` | ✉ | Email address fields, email notification channels, compose |
| `bell` | 🔔 | Notification center button, notification prefs, new-message alerts |
| `team` | 👥 | Team member sections, agency roster, multi-person contexts |
| `user` | 👤 | Single person — profile, account settings, talent detail |

**Do:** use `bell` for the top-bar notification icon. Use `mail` for the inbox surface entry point if no dedicated inbox icon is added.
**Don't:** use `user` for team-size contexts — use `team`.

---

### Objects & content

| Name | Visual | Use for |
|---|---|---|
| `calendar` | 📅 | Booking dates, calendar surface, event scheduling |
| `map-pin` | 📍 | Location fields, on-set address, city filter |
| `globe` | 🌐 | Public-facing page, domain settings, multi-market scope |
| `star` | ★ | Reviews, ratings, favourites, "featured" badge |
| `circle` | ○ | Neutral status dot, empty placeholder ring |

**Do:** use `calendar` on any date-adjacent label (not just the calendar page).
**Don't:** use `star` for "priority" — use the priority label text instead. Stars are for review/rating surfaces only.

---

### System & settings

| Name | Visual | Use for |
|---|---|---|
| `settings` | ⚙ | Settings navigation item, workspace config |
| `search` | 🔍 | Search inputs, command palette trigger, filter bars |
| `filter` | ⚡ | Active filter chip, filter panel toggle |
| `palette` | 🎨 | Branding settings, color/theme customization |
| `credit` | 💳 | Billing settings, plan card, payment method |

**Do:** use `search` as the leading icon inside `<TextInput>` search fields.
**Don't:** use `settings` for general "options" menus — those should use a three-dot icon (not yet in the registry; add before using).

---

### Feedback & alerts

| Name | Visual | Use for |
|---|---|---|
| `alert` | ⚠ | Error toasts, destructive confirmations, validation failures |
| `info` | ℹ | Info toasts, help tooltips, contextual guidance |
| `sparkle` | ✦ | AI-generated content, premium features, celebratory moments |
| `bolt` | ⚡ | Automation, integrations, triggered actions, quick actions |
| `moon` | 🌙 | Do not disturb / quiet hours, dark mode (if added) |

**Do:** use `alert` only for genuine warnings/errors — not for "caution" or soft messages.
**Do:** use `sparkle` to signal AI-assist, smart suggestions, or Pro/Portfolio premium gating.
**Don't:** use `bolt` for "fast" — it means automation/integrations, not speed.

---

## 3. Size guide

| Size | Context |
|---|---|
| `10–11` | Inside a chip/pill label alongside text |
| `12` | Inline with body text, badge decorations |
| `14` | Default — most buttons, form labels, row indicators |
| `16` | Standalone icon buttons (no label), card section headers |
| `18–20` | Drawer section headers, large CTA buttons |
| `24+` | Empty state illustrations, onboarding cards |

---

## 4. Stroke guide

| Stroke | Effect | Use for |
|---|---|---|
| `1.4–1.6` | Light, delicate | Default — most UI contexts |
| `1.8–2.0` | Medium, clear | Small sizes (10–12) where thinness would blur |
| `2.2–2.4` | Bold, punchy | Check marks on filled backgrounds, error/success indicators |

---

## 5. Color conventions

| Context | Color to use |
|---|---|
| Default icon in body copy | `currentColor` (inherits from parent) |
| Muted / secondary | `COLORS.inkMuted` (`#6B7280`) |
| Disabled | `COLORS.inkDim` (`#9CA3AF`) |
| Active / highlighted | `COLORS.accent` (`#1F5C42`) |
| Error / destructive | `#EF4444` (red-500) |
| White on colored background | `#FFFFFF` |

Never hardcode a hex directly — reference from `COLORS.*` or use the semantic role above.

---

## 6. Adding a new icon

1. Choose the Lucide SVG path(s) for the icon.
2. Add a new `case` to the `switch` in `Icon()` in `_primitives.tsx`.
3. Add the name string to the `name` union type above the `switch`.
4. Update this document: add a row to the correct section above.
5. Add `aria-label` guidance in the component that first uses it.

**Never** import Lucide directly (`import { X } from "lucide-react"`) — always go through the `Icon` wrapper so the registry stays typed and auditable.

---

## 7. Icons NOT yet in the registry (pending addition)

The following icons are needed by upcoming workstreams but not yet implemented. Add them before building the relevant feature.

| Icon | Needed for |
|---|---|
| `three-dot` / `ellipsis` | Overflow menus on rows |
| `upload` | File drag-drop zones |
| `download` | Bulk download, zip export |
| `file` | File attachment rows |
| `image` | Photo gallery, image attachment |
| `video` | Video attachment type |
| `drag-handle` | Drag-and-drop reorder handles |
| `copy` | Copy-to-clipboard actions |
| `phone` | SMS/phone notification channel |
| `flag` | Report / flag content |
| `shield` | Safety, verified trust badge |
| `link` | Shareable links, URL copy |
| `layers` | Shortlists, collections |
| `tag` | Taxonomy tags |
| `send` | Send message / submit action |
| `refresh` | Retry, reload, sync |
| `clock` | SLA timers, timestamps (larger) |
| `trending-up` | Analytics, career growth |
| `award` | Trust badges, achievements |
| `key` | API keys, integrations |
