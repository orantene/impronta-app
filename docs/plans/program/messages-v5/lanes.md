# Lane ledger

| Lane | Model | Status | Branch | PR | Gates (exit codes) | Notes |
|---|---|---|---|---|---|---|
| S1 | Claude Opus 5 | PR open | work/msg-s1 | #2061 | lint 0 · test:messaging 0 (48/48) · test:inquiry-workspace 0 (123/123) · typecheck 0 (load 5.5) | One thread-type rule (D-MSG-2): engine writes every staff message to "private"; every client reader excludes internal_note; POS ThreadMessage carries `thread`; static test `client-readers.static.test.ts`; seam D-MSG-2a (RLS by thread only) |
