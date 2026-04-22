# QA Feedback Framework

One lightweight schema for every finding from a real-agency QA session.
The goal is capture that can be sorted, prioritized, and actioned without
re-interpreting the tester's words 24 hours later.

---

## Categories (5)

Every finding gets exactly one category. Pick the closest fit.

| Letter | Category | Meaning |
|---|---|---|
| **B** | Blocker | The tester could not complete a task, OR the tester cannot be trusted to complete it without help on their own. Includes crashes, broken states, misleading UX that causes data loss. |
| **C** | Confusion | The tester completed the task but took a wrong turn, asked a question, hesitated noticeably, or said "I don't get it." The action worked; the UX didn't guide. |
| **T** | Trust issue | The tester did the thing but didn't believe what they saw. "Did that save?" "Is that actually live?" "Am I about to break something?" Every trust issue erodes the premium feel faster than a missing feature. |
| **P** | Polish issue | Copy is rough, visuals feel off, language is technical, labels are inconsistent, transitions are abrupt, empty state is sparse. Not functionally wrong; tonally wrong. |
| **F** | Feature request | The tester asked for a capability that doesn't exist. This is informational only — we do not let feature requests derail the polish pass. File into the product backlog. |

---

## Severity (3)

Orthogonal to category. Applied by the facilitator, confirmed in
triage.

| Letter | Severity | Meaning |
|---|---|---|
| **1** | Must fix before Round 2 | Blocks the next QA cycle. Bugs, silent data loss, anything that leaves the tester stuck. |
| **2** | Fix in the next polish sprint | Reduces confusion / erodes trust but doesn't stop the tester. Most polish issues and most confusions live here. |
| **3** | Nice-to-have | Feature requests, edge-case nice-to-haves, anything that wouldn't have changed the tester's score even if we'd fixed it. |

**Default rule:** a finding is **2** unless it clearly breaks a task (→ **1**)
or clearly doesn't matter to premium/trust/effortless (→ **3**).

---

## One-finding template

Copy this into `docs/QA_FINDINGS.md` per finding. Keep it short. Long
findings lose signal.

```
### F-<session>-<nn> — <one-line title>

- Session: <tester id> · <date>
- Category: B | C | T | P | F
- Severity: 1 | 2 | 3
- Surface: <route / component>
- What happened: <2–3 sentences>
- Tester's words: "<short quote>"
- Expected: <1 sentence>
- Suggested fix: <1–2 sentences>
- Owner / assignee: <person or sprint>
- Status: open | in progress | fixed (<commit>) | rejected
```

### Example

```
### F-01-03 — "Save draft" was invisible so tester thought autosave was broken

- Session: tester-01 · 2026-04-22
- Category: T  (trust issue)
- Severity: 2
- Surface: /admin/site-settings/sections/[id] — section editor
- What happened: tester edited the hero headline, watched the "Saving…"
  chip transition to "All changes saved," but refreshed the page to
  check. They said "I wanted to be sure." Behavior was correct; trust
  was not earned.
- Tester's words: "I wasn't 100% sure that was actually saved."
- Expected: autosave chip should feel final, without a reload urge.
- Suggested fix: add a brief, opt-in toast on the first autosave of a
  session ("Autosave is on — your changes are saved as you type") that
  dismisses permanently.
- Owner / assignee: next polish sprint
- Status: open
```

---

## Severity triage rules

When the facilitator is unsure:

- **Did data go missing, did the tester give up, or did they shout for
  help?** → **Severity 1**.
- **Did the tester pause for 10+ seconds, ask a question, or take a wrong
  turn?** → **Severity 2**.
- **Did the tester say "it would be nice if…" but also complete the
  task without friction?** → **Severity 3**.

Promote on escalation, never demote without consensus.

---

## Finding IDs

Format: `F-<session#>-<nn>`, two-digit counter per session. Re-use
per-session numbering so finding ids stay short. Session id is the
tester profile (tester-01, tester-02).

---

## Triage cadence

- **Within 24 hours of each session:** facilitator transcribes all
  findings into `docs/QA_FINDINGS.md` with category + severity.
- **End of Round 1 (after 3 sessions):** product triage meeting. Confirm
  severities. Re-sort. Decide which 1s block Round 2. Decide which 2s
  get a focused polish sprint. Defer 3s.
- **Between sessions within Round 1:** fix Severity-1 findings from
  prior sessions only if they would otherwise dominate subsequent
  sessions. Otherwise, do not iterate mid-round — we want comparable
  sessions.

---

## What a single session's dataset looks like

At the end of each session the facilitator should have:

- One screen + voice recording (30–45 min).
- A scored exit survey (Premium / Trustworthy / Effortless, 0–5 each, +
  two open questions).
- 8–20 findings filed using the template above.
- Time-to-first-publish recorded in minutes.
- "Did tester fear losing work?" yes/no.
- "Did tester publish without help?" yes/no.

Aggregate across three sessions for Round 1 conclusions.

---

## Anti-patterns to avoid

These hollow out QA value:

- **Fixing live during the session.** We are measuring, not debugging.
- **Defending the design.** If the tester is confused, that is the data.
- **Aggregating findings into "buckets."** Every finding keeps its own
  concrete tester quote. We lose specificity with buckets.
- **Skipping the exit survey.** The scored scales are the only way to
  track product feel across rounds.
- **Running without recording.** Memory is lossy; transcripts are gold.
- **Scoring Round 1 as pass/fail.** Round 1 informs Round 2; it is not
  a gate.
