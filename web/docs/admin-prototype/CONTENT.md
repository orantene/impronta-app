# CONTENT.md — Tulala Admin Voice & Copy Standards

> Copy is part of the product. This document defines tone, capitalization, error patterns,  
> empty-state copy, and the toast voice guide.

---

## 1. Voice Principles

| Principle | What it means | Example |
|---|---|---|
| **Direct** | Say what happened. No preamble, no hedging. | "Offer sent." not "Your offer has been successfully transmitted." |
| **Human** | Write for people, not for a system log. | "Nothing here yet" not "No records found." |
| **Decisive** | Active voice, past tense for confirmations. | "Booking confirmed" not "The booking has been confirmed" |
| **Calm** | Errors explain, don't alarm. | "That didn't work — try again." not "Error 422: Validation failed." |
| **Concise** | Every word earns its place. Cut adverbs. | "Saved" not "Successfully saved" |

---

## 2. Capitalization

| Context | Rule | Example |
|---|---|---|
| Page titles | Title case | "Inquiry Pipeline" |
| Section headings | Title case | "Recent Activity" |
| Drawer titles | Title case | "Edit profile" ← sentence case OK too |
| Button labels | Sentence case | "Send offer" not "Send Offer" |
| Menu items | Sentence case | "View all" |
| Status chips | Sentence case | "Offer sent" |
| Toast messages | Sentence case | "Offer sent to Net-a-Porter" |
| CapsLabel / metadata labels | All caps (component handles it) | "ACTIVE" |
| Error messages | Sentence case | "Something went wrong — try again." |
| Empty state titles | Sentence case | "Nothing here yet" |
| Empty state bodies | Sentence case | "Add your first talent to get started." |

---

## 3. Toast Messages

Toasts confirm actions. They are brief, past-tense, and free of brand filler.

### Format rules

- **Confirmations:** past tense verb + noun phrase
- **Counts:** spell out the noun ("1 item" not "1", "2 items" not "2")
- **Stubs (coming soon):** just say "Coming soon" — never append the feature name
- **Errors:** sentence-case, actionable hint if possible

### Confirmation patterns

| Situation | Toast text |
|---|---|
| Single item saved | `"Saved"` |
| Named item saved | `` `"${name}" saved` `` |
| Item created | `"Booking created"` or `` `Booking ${id} created` `` |
| Offer sent | `"Offer sent"` |
| Offer accepted | `"Offer accepted"` |
| Offer declined | `"Offer declined"` |
| N items archived | `` `Archived ${n} ${n === 1 ? "item" : "items"}` `` |
| N items marked read | `` `Marked ${n} ${n === 1 ? "item" : "items"} read` `` |
| Export completed | `` `Exported ${n} rows to CSV` `` |
| Language changed | `` `Language set to ${code}` `` |
| Snoozed | `` `Snoozed ${name} for 4h` `` |
| Copied | `"Copied to clipboard"` |
| Not yet implemented | `"Coming soon"` |

### Error patterns

| Situation | Toast text |
|---|---|
| Generic failure | `"Something went wrong — try again."` |
| Network error | `"Connection lost — your changes are safe."` |
| Permission denied | `"You don't have permission to do that."` |
| Validation error | `"Check the highlighted fields."` |

---

## 4. Empty States

### Anatomy

```
[icon]
Title (sentence case, ≤5 words)
Body (1–2 sentences, helpful + direct)
[Primary CTA button — optional]
[Tips list — optional]
```

### Tone guidelines

- **Title:** what's missing, stated plainly. Not "No results found" — try "Nothing here yet" or "No talent found".
- **Body:** explain why + what to do next. If there's genuinely nothing to do, say it plainly.
- **CTA label:** verb phrase — "Add talent", "Log a booking", "Invite a teammate".

### Copy examples by context

| Context | Title | Body | CTA |
|---|---|---|---|
| Empty roster | "No talent yet" | "Add your first talent to start building your roster." | "Add talent" |
| Search no results | `No results for "${q}"` | "Try a different search term or clear filters." | — |
| Empty inbox | "Inbox is empty" | "New messages from clients and talent will appear here." | — |
| Empty inquiry pipeline | "No active inquiries" | "Inquiries from clients will show here once they arrive." | — |
| Calendar — no bookings | "Nothing scheduled" | "Confirmed bookings appear here." | — |
| Action items — all done | "All clear" | "Nothing needs your attention right now." | — |
| Locked feature | "Unlock [feature]" | "Available on [Plan] and above." | "Upgrade plan" |
| Audit log — no events | `No ${category} actions yet` | "Actions will appear here as the inquiry moves through the pipeline." | — |

---

## 5. Labels and Metadata

### Status labels — use plain English, not internal codes

| Context | Label | Not |
|---|---|---|
| Inquiry statuses | "New", "Offer sent", "Confirmed", "Archived" | "PENDING", "SUBMITTED", "STATE_4" |
| Talent states | "Active", "On hold", "Archived" | "PUBLISHED", "INACTIVE" |
| Booking states | "Upcoming", "Completed", "Cancelled" | "CONFIRMED", "DONE" |
| Payment states | "Awaiting payment", "Paid", "Overdue" | "PENDING", "COMPLETED" |

### Roles — spell them out

| Code | Label |
|---|---|
| `owner` | Owner |
| `coordinator` | Coordinator |
| `editor` | Editor |

### Plan names — always Title Case

| Plan | Label |
|---|---|
| `free` | Free |
| `studio` | Studio |
| `agency` | Agency |

---

## 6. Microcopy

### Confirm dialogs

Pattern: "Are you sure?" is vague. Be specific about what will happen.

```
// ✅
"Archive Kai Lin? They'll be hidden from the public roster but you can restore them later."

// ❌
"Are you sure you want to archive this talent?"
```

Confirm button label should echo the action: **"Archive"** not **"Yes"** or **"OK"**.
Cancel button: always **"Cancel"** (not "No" or "Go back").

### Placeholders

- Meaningful, not instructions: `"Company name"` not `"Enter company name"`
- Never use placeholder as a label substitute — always include a real label

### Helper text / hints

- Below the field, not inside it
- Present tense, 1 sentence max: `"Used on your public roster and invoices."`

---

## 7. Numbers and Units

| What | Format | Example |
|---|---|---|
| Currency | € followed by value, no space | `€3,400` |
| Large numbers | Comma thousands separator | `€23,000` |
| Percentages | No space before % | `46%` |
| Dates | Abbreviated month, no year if current year | `Apr 22 · 14:32` |
| Relative time | lowercase | `2h ago`, `yesterday`, `3d ago` |
| Counts | Plural noun with count | `8 talent`, `3 bookings`, `1 item` |

---

## 8. Prohibited Phrases

| ❌ Avoid | ✅ Use instead |
|---|---|
| "Successfully …" | Just state the result: "Saved" |
| "Please …" (in toasts/confirmations) | Drop it — it's noise |
| "Error occurred" | Describe what failed |
| "N/A" | `—` (em-dash) |
| "Coming soon — [Feature Name]" | `"Coming soon"` |
| "You have no …" | "No … yet" or "Nothing here yet" |
| "This action cannot be undone" | OK to use, but combine with specific description |
