# AI confidence model

Structured confidence for AI-facing copy (especially match explanations):

| Level | Meaning | Example |
|-------|---------|---------|
| `high` | Deterministic from DB fields / approved rules | “Located in Cancún” from location match |
| `medium` | Heuristic or softer pattern | Styled look descriptions |
| `low` | Speculative or thin evidence | Vague “similar vibe” |

Phase **11** payloads should include per-line confidence; UI may badge or de-emphasize `low`.
