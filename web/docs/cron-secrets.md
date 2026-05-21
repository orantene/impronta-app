# Cron secrets — what each scheduled job needs

Last updated: 2026-05-20.

Every `/api/cron/*` route validates a Bearer token against `CRON_SECRET` and
returns 401 on mismatch / 503 when the env var isn't set. Vercel Cron sends
`Authorization: Bearer $CRON_SECRET` automatically when the var is set in
the Vercel project env; production has had this configured since 2026-05-15.

For local manual testing, every dev needs the same var in `web/.env.local`
(any value — it's compared against itself):

```
CRON_SECRET=<openssl rand -hex 32>
```

`web/.env.local` is gitignored, so each agent / dev may use their own value.
The Vercel env value is the only one that matters for live cron runs.

## Routes and their requirements

| Route | Schedule (UTC) | Required env (beyond `CRON_SECRET`) | Purpose |
|---|---|---|---|
| `/api/cron/skill-metrics-refresh` | `0 4 * * *` (daily 04:00) | none | Refresh skills usage rollups. |
| `/api/cron/cleanup-guest-cart` | `0 5 * * *` (daily 05:00) | none | Drop guest favorites > 30 days old. |
| `/api/cron/refresh-discover-index` | `*/15 * * * *` (every 15 min) | none | Refresh `talent_discover_index` materialized view. |
| `/api/cron/usage-audit` | `0 9 * * 1` (weekly Mon 09:00) | `USAGE_AUDIT_EMAIL_TO` *(optional)*, `RESEND_API_KEY` *(optional)* | Alert when Supabase storage / DB size / large media / orphan media crosses thresholds. Always writes to `platform_alerts`; emails recipient when configured. |

## Manual test — usage-audit

After `npm run dev`:

```bash
curl -H "Authorization: Bearer $(grep '^CRON_SECRET=' web/.env.local | cut -d= -f2-)" \
     http://localhost:3000/api/cron/usage-audit | jq .
```

Returns:
- `{ ok: true, summary: "all green", ... }` when every check is < 60% of quota.
- `{ ok: true, summary: "N critical, M warn", report, alerts, metrics }` when
  anything's WARN or CRITICAL. Same payload is mirrored into
  `public.platform_alerts` (one row per finding, deduped by
  `(audit_date, category, content_hash)` — re-running the same day is a no-op).

## Force a critical alert (verification)

Temporarily lower a threshold inside the route — e.g. set
`FREE_PLAN_STORAGE_LIMIT_BYTES = 1024 * 1024` (1 MB) — re-curl, confirm a
CRITICAL line appears and a `platform_alerts` row is inserted:

```sql
SELECT audit_date, severity, category, message FROM platform_alerts
ORDER BY created_at DESC LIMIT 5;
```

Restore the threshold and confirm the next run reports `all green` again
(unless real findings remain).

## Where production sends the email

When `RESEND_API_KEY` is provisioned (see user-memory `blocked_external_input.md`),
the cron mails the report to:
1. `USAGE_AUDIT_EMAIL_TO` if set, else
2. `EMAIL_REPLY_TO` if set, else
3. nobody — DB-only delivery, console warns once per run.

Set `USAGE_AUDIT_EMAIL_TO` to your platform-operator inbox in the Vercel
project env when you're ready to receive these.
