# Talent Tulala Dashboard — Phase Agent Tasks

One-click execution of Phases A–F of
[`../talent-tulala-dashboard-execution-plan-2026-05-25.md`](../talent-tulala-dashboard-execution-plan-2026-05-25.md)
via the Cursor SDK + VSCode tasks.

## What it does

Each phase prompt (`phase-{a..f}.md`) is fed to a fresh Cursor agent running
locally against this repo (`local: { cwd }`). The agent:

1. Reads `_preamble.md` (universal rules).
2. Reads the master plan.
3. Executes the single phase you triggered.
4. Runs the acceptance gates (typecheck, lint, optionally tenant-isolation).
5. Writes a structured report and exits.

The runner is `scripts/agent/run-phase.mjs`. It uses `Agent.prompt(...)` from
`@cursor/sdk` — one-shot, disposes for you.

## One-time setup

1. **Mint a Cursor API key** at <https://cursor.com/dashboard/integrations>.
2. **Export it** in the shell you'll launch Cursor from:
   ```
   export CURSOR_API_KEY=cursor_...
   ```
   (Or put it in `~/.zshenv` if you want it always loaded.)
3. **Install the SDK**:
   - VSCode/Cursor → **Tasks: Run Task** → `Talent Dashboard: Install Cursor SDK (one-time)`
   - Or directly: `npm install --save-dev @cursor/sdk`

## Running phases

Open the Command Palette (`Cmd+Shift+P`) → **Tasks: Run Task** → pick one.

Tasks live under the prefix `Talent Dashboard:`.

| Task | What it does |
|---|---|
| `Talent Dashboard: Preview Phase X prompt (dry run)` | Prints the composed prompt for phase X. No agent invoked. No tokens spent. |
| `Talent Dashboard: Run Phase X` | Runs phase X. Prompts you to pick a Cursor model on first invocation per session. |
| `Talent Dashboard: BUILD ALL (Phases B → F sequentially)` | Chains B → C → D → E → F. **Default build task** — `Cmd+Shift+B` runs this. |
| `Talent Dashboard: BUILD ALL (A → F sequentially)` | Same but includes Phase A (decision log). |

A phase failure stops the chain. The dedicated terminal panels stay open so you
can read the agent's final report.

## Costs + safety

- Each phase = real agent compute (your Cursor account). Phase C and Phase D
  are the longest by design (4 days of work each).
- The runner sets `settingSources: []` — no ambient project settings leak into
  the agent.
- The runner does NOT push to git or promote to prod. Phase F has explicit
  gates for that.

## Picking a different model

Each run task accepts a `cursorModel` input (pick on first run). The default
is `composer-2.5`. Set `CURSOR_MODEL` in your shell to override globally:

```
export CURSOR_MODEL=composer-2.5
```

## If something breaks

| Symptom | Fix |
|---|---|
| `@cursor/sdk is not installed` | Run the install task or `npm install --save-dev @cursor/sdk`. |
| `CURSOR_API_KEY is not set` | `export CURSOR_API_KEY=cursor_...` then relaunch Cursor (env propagates to tasks). |
| `startup failed (CursorAgentError)` | Auth/network/config. Check key, internet, and `cursor.com` status. |
| `run failed (status=error)` | The agent ran but couldn't finish. Open the run id printed in the terminal in your Cursor dashboard. |
| Phase agent edits unrelated files | The preamble forbids it; if it happened anyway, `git restore` the unrelated files and rerun the phase. Consider tightening that phase's prompt. |

## Files in this directory

| File | Purpose |
|---|---|
| `README.md` | this file |
| `_preamble.md` | universal rules every phase agent must follow |
| `phase-a.md` | decision freeze (0.5 d) |
| `phase-b.md` | switcher cleanup (2 d) |
| `phase-c.md` | unified inbox (3–4 d) |
| `phase-d.md` | revenue plumbing (3–4 d) |
| `phase-e.md` | Money page (3–4 d) |
| `phase-f.md` | retire + smoke (2 d) |
