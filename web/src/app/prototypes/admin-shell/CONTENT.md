# CONTENT.md — Tulala Voice, Tone & Copy Guide

> **WS-17.7** · How we write UI text. Capitalization, error messages, empty states, toast copy, and button labels.

---

## 1. Voice and tone

**Who we are:** a calm, professional, direct B2B SaaS. Not cold, not chatty.

**Three traits:**
1. **Clear** — every label does one job. No jargon the user hasn't introduced.
2. **Respectful** — we treat coordinators and talent as experts. No over-explaining.
3. **Efficient** — fewer words. Never pad a label to sound warmer.

**Avoid:**
- Exclamation marks (except genuine milestone moments — "First booking confirmed! 🎉")
- Passive voice in error messages ("Your request could not be processed" → "Something went wrong — try again")
- Hedging ("might be able to", "could possibly") in CTAs

---

## 2. Capitalization rules

| Context | Rule | Examples |
|---|---|---|
| Page titles | Title Case | "Workspace Settings", "Confirmed Bookings" |
| Section headings | Title Case | "Plan & Billing", "Danger Zone" |
| Button labels | Title Case | "Send Counter", "New Inquiry" |
| Toast messages | Sentence case | "Counter sent to coordinator" |
| Error messages | Sentence case | "File too large — max 20 MB" |
| Eyebrow / capsule labels | ALL CAPS | "OFFER PENDING", "AWAITING CLIENT" |
| Meta / timestamps | lowercase | "updated 2h ago", "3 new" |
| Form field labels | Title Case | "Counter Rate (€/day)", "Note to Coordinator" |

---

## 3. Button labels

**CTAs should be verb-first and specific:**

| ❌ Vague | ✅ Specific |
|---|---|
| Submit | Send counter |
| OK | Confirm booking |
| Click here | View inquiry |
| Continue | Save and continue |
| Yes | Delete workspace |

**Destructive buttons** should name the thing being destroyed:
- "Delete workspace" (not "Delete")
- "Leave agency" (not "Leave")
- "Archive inquiry" (not "Archive")

---

## 4. Toast messages

Toasts are confirmation + context, not just "Done."

| Action | ✅ Toast text |
|---|---|
| Send inquiry | "Inquiry sent to Acme Models" |
| Send counter | "Counter sent to coordinator" |
| Archive row | "Inquiry archived" |
| Save settings | "Settings saved" (use AutoSaveIndicator instead) |
| Upload file | "call-sheet.pdf uploaded" |
| Error: upload failed | "Upload failed — file too large (max 20 MB)" |

**Rules:**
- Max 1 sentence.
- Name the entity when possible ("Inquiry archived" not "Item archived").
- Error toasts: cause + what to do next.

---

## 5. Empty states

Empty states have three jobs: name what's absent, explain why it matters, and offer a path forward.

**Pattern:**
```
[Short noun phrase title]
[One-sentence explanation of what belongs here and why.]
[Optional CTA — action verb]
```

**Examples:**

| Surface | Title | Body | CTA |
|---|---|---|---|
| Inbox zero | "Your inbox is clear" | "No messages waiting. Conversations will appear here." | "Browse talent" |
| No inquiries | "No inquiries yet" | "Send your first inquiry to start the booking process." | "New inquiry" |
| No bookings | "No bookings yet" | "Confirmed bookings appear here." | "See inquiries" |
| No results | "No results for \"{query}\"" | "Try different keywords or adjust your filters." | — |
| All caught up | "All caught up" | "You're up to date." | — |

**Never:**
- "Nothing here" (gives the user no information)
- "No data found" (technical, cold)
- Illustration without text

---

## 6. Error messages

Always answer: what went wrong, and what can the user do?

| ❌ Vague | ✅ Specific |
|---|---|
| "Error" | "Could not send message — check your connection and try again" |
| "Invalid input" | "Rate must be a number between 100 and 99,999" |
| "Not allowed" | "Only owners can change billing settings" |
| "Something went wrong" | "File upload failed — try a smaller file (max 20 MB)" |

---

## 7. Status labels

Status labels appear on chips, CapsLabels, and column headers. They must be:
- Present-tense adjective or noun phrase (not past tense)
- Consistent across all surfaces (workspace/talent/client see the same vocabulary)

**Inquiry stage labels** (from `INQUIRY_STAGE_META`):

| Stage key | Label |
|---|---|
| `draft` | Draft |
| `submitted` | Submitted |
| `coordination` | Coordinating |
| `offer_pending` | Offer pending |
| `approved` | Approved |
| `booked` | Booked |
| `rejected` | Rejected |
| `expired` | Expired |

---

## 8. Placeholder text

Placeholders supplement labels — they never replace them.

**Pattern:** "e.g. {realistic example}"
- `"e.g. 2200"` not `"Enter rate"`
- `"e.g. Available Mon–Fri, 9am–6pm"` not `"Describe availability"`

---

## 9. Help and tooltip copy

Help text (drawer `HelpEntry`) follows the three-question template:
1. **What is this?** — one sentence.
2. **Why does it matter?** — business impact, not features.
3. **What should I do?** — the concrete next action.

---

## 10. Confirmed celebratory moments

Only three moments warrant celebration copy + emoji:
1. First booking confirmed
2. First inquiry sent
3. Profile 100% complete

All others use neutral confirmation toasts.
