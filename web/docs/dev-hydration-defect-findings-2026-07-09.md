# Dev-server hydration defect — Lane F investigation findings (2026-07-09)

**Symptom (as documented in the services program):** pages served by the worktree dev server
(`npm run dev:webpack`) never become interactive in local Chrome. SSR HTML is perfect,
no errors anywhere, but clicks on client islands do nothing.

## Verdict

**The defect is DEV-MODE-ONLY, inside the Next 16 dev runtime — not app code, not the
environment, not browser extensions.** A production build served locally from the same
worktree hydrates and responds to clicks.

## Evidence (all on worktree `impronta-services`, same Chrome, same host proxy :3310)

| Probe | `next start` (prod build) | `npm run dev:webpack` |
|---|---|---|
| SSR render | ✅ | ✅ |
| Client state renders (header badge) | ✅ | ❌ |
| Real click on the storefront category pill | (crashes first, see caveat) | ❌ ignored — `aria-pressed` stays on "All", 5 rows |
| React error boundary can render | ✅ (proves client React runs) | n/a |
| RSC flight payload | n/a | ✅ delivered (92 inline `__next_f.push` chunks) AND consumed (`push` replaced by the stream receiver) |
| Event delegation (`_reactListening`) | ✅ | ✅ armed — `hydrateRoot` ran |
| Fibers on DOM nodes / DevTools-hook renderers | ✅ | ❌ zero fibers, `renderers.size === 0` — **hydration never COMMITS** |
| Console | — | only `[Client Instrumentation Hook] Slow execution detected: 75ms` |

## Ruled out

- **CSP / nonces** — no CSP meta, zero nonced scripts in dev; flight chunks executed.
- **Pending network** — 0 unfinished requests; `readyState: complete`; flight stream fully consumed.
- **Sentry / client instrumentation** — stubbed `src/instrumentation-client.ts` to a no-op
  and reloaded: still no commit. (Restored afterward.)
- **React DevTools extension** — the global hook present is Next's own minimal dev-overlay
  shim (`renderers|supportsFiber|inject|onScheduleFiberRoot|onCommitFiberRoot|…`), not the
  extension. `nextjs-portal` (dev overlay) is mounted.
- **node_modules integrity** — real `npm ci` install (prior session) + this session's clean
  `.next` rebuild; same behavior.

## Remaining suspects (next session)

React never commits the hydration render although it has the full payload and armed
listeners — a silently suspended hydration inside the dev runtime. Most likely
interaction: the Next 16 dev overlay / segment-explorer hook wrapping. Next steps:
1. Bisect with a minimal route (a bare page with one client island) on the same server.
2. Try disabling the dev overlay/devtools (`NEXT_PRIVATE_*` flags, or `next dev` Turbopack
   in a NON-worktree checkout) to isolate the overlay.
3. Wrap `hydrateRoot` via a custom `onRecoverableError`/`onCaughtError` logger to see if a
   recoverable error loop is swallowing the commit.
4. File the upstream repro once minimal (Next 16 canary, webpack dev, RSC page).

## Workaround (WORKING, use for local interactive QA)

```bash
cd web && rm -rf .next && npm run build && PORT=3300 npx next start
node scripts/services-host-proxy.mjs   # 3310 → 3300, Host: improntamodels.com
# browse http://localhost:3310/...
```

Hydration + clicks work. **One caveat:** Server Actions abort through the proxy
(`x-forwarded-host: improntamodels.com` ≠ `origin: localhost:3310` → "Invalid Server
Actions request"), so pages that fire a mount-time action will error-boundary after a
few seconds. Interactions that don't hit an action (filters, sheets, steppers) test fine.
To fully fix, add the proxy origin to `experimental.serverActions.allowedOrigins` in a
local-only config — do NOT ship that to prod.

Until then the standing rule holds: **final interactive QA on production after deploy.**
