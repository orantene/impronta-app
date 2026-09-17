# Lane ledger

| Lane | Model | Status | Branch | PR | Gates (exit codes) | Notes |
|---|---|---|---|---|---|---|
| S4 | Claude Sonnet 5 | PR open | `work/msg-s4` | TBD (opened this session) | `test:messaging` 0 (74/74) · `test:inquiry-workspace` 0 (123/123) · `lint` scoped to every touched file 0 errors (whole-repo `npm run lint` was still queued behind the machine-wide 1-slot lock at hand-off — contended by several other lanes' concurrent lint runs the whole session, confirmed live/progressing via `ps`, not wedged) · `typecheck` not obtained (same queue) | Rename, conversation history, merge, `deriveTasks`. No migration. D-MSG-2..6 in decisions.md: no `subject`/`title` column (event-sourced via `inquiry_action_log`), history is staff-only, merge's paid/confirmed guard covers only `order`+`offer` kinds, assign/handover/resolve/reopen/close-lost now self-log to `inquiry_action_log` (existing RPCs don't), and a tooling note on the node_modules symlink fix mid-session. |
