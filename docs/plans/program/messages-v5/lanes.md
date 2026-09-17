# Lane ledger

| Lane | Model | Status | Branch | PR | Gates (exit codes) | Notes |
|---|---|---|---|---|---|---|
| S7 | Sonnet 5 | PR open | work/msg-s7 | [#2057](https://github.com/orantene/impronta-app/pull/2057) | voice-meta.test.ts 0 (7 pass); thread-token.test.ts 0 (10 pass); messaging+messages-v5 suite 55 pass/2 fail (pre-existing, unrelated — see PR); lint blocked (broken shared node_modules, ESM ignores NODE_PATH); typecheck skipped (load 7.71<9 but queue's tsc binary also broken; declined to bypass the serialisation queue at 5-min load 8.29) | 3 commits: voice message_kind text+metadata.voice, thread-token exp-from-record (D-MSG-6), useMessagingInboxLive replaces POS 12s poll. refreshThreadToken exported, NOT wired into payment/confirm (seam, D-MSG-4). |
