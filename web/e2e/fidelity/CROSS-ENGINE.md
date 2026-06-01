# Cross-engine (WebKit) fidelity goldens

The fidelity suite now runs under two Playwright projects:

| Project    | Engine            | Frames covered                        | Golden suffix          |
| ---------- | ----------------- | ------------------------------------- | ---------------------- |
| `chromium` | Blink (Chrome)    | static (9) **+** motion (2)           | `*-chromium-darwin.png`|
| `webkit`   | WebKit (Safari)   | static (9) — motion frames self-skip  | `*-webkit-darwin.png`  |

WebKit is scoped to `fidelity.spec.ts` only (`playwright.config.ts` `testMatch`)
so the broader e2e suite is not doubled. The platform is PWA-first, so Safari /
iOS rendering is a real regression surface — hence a dedicated engine, not a
shared golden.

## Why the motion frames are chromium-pinned

`scrolled` (sticky nav + `backdrop-filter` glass over content) and `reveal`
(scroll-timeline entrance) depend on compositing/scroll-timeline behaviour that
differs materially between Blink and WebKit. A shared golden there would be
noise, not signal, so the motion frames `test.skip` on non-chromium. The webkit
project proves the **static** layout/typography/color/spacing/asset axes render
honestly in Safari's engine — which is what "widen browser coverage" asks for.

## Why the webkit goldens are not committed in this PR (yet)

Fidelity goldens are **macos-14-specific** and must be seeded **on CI**, never on
a dev mac — a dev-mac PNG drifts ~2–4% from the macos-14 runner on sub-pixel AA
and fails the strict (default-threshold) static-frame comparison. This is the
same constraint the chromium goldens already live under (see
`builder-fidelity.yml` `update_snapshots`).

Seeding runs through `workflow_dispatch` (`update_snapshots=true`), and a
`workflow_dispatch` trigger is only dispatchable when it exists on the
repository **default branch**. That trigger arrives on `main` with the P4
harness lane; until it lands, the seed cannot be dispatched. (The dispatcher
also needs a token with `actions:write` — a read-scoped PAT returns HTTP 403.)
Committing dev-mac webkit PNGs instead would just hand CI a guaranteed ~2–4%
failure.

So this PR ships the full **mechanism** and a documented seed procedure; the
`*-webkit-darwin.png` frames are one CI dispatch away.

## What was verified locally (macOS, `npx playwright install webkit`)

- WebKit runs the static fidelity spec end-to-end — 9 frames captured, the 2
  motion frames correctly skipped.
- **Run-to-run determinism**: a second run with no `--update-snapshots` produced
  **0 pixel diff** across all 9 frames — webkit is not internally flaky, so
  macos-14 seed → macos-14 validate will match tightly.
- **Engine divergence** (justifies a separate golden set): e.g. `editorial`
  desktop 206 KB (chromium) vs 155 KB (webkit); `saas` desktop 375 KB vs 676 KB
  — the engines render fonts, gradients, and glass substantially differently.

## How to seed the webkit goldens (once `workflow_dispatch` is on `main`)

```bash
# 1. Seed BOTH engines on the macos-14 runner and upload the snapshot dir.
gh workflow run builder-fidelity.yml --ref <this-branch> -f update_snapshots=true

# 2. When the run finishes, download the seeded goldens artifact.
gh run download <run-id> -n fidelity-goldens-seeded -D /tmp/fidelity-goldens

# 3. Commit ONLY the new webkit frames.
cp /tmp/fidelity-goldens/*-webkit-darwin.png \
   web/e2e/fidelity/fidelity.spec.ts-snapshots/
git add web/e2e/fidelity/fidelity.spec.ts-snapshots/*-webkit-darwin.png

# 4. Make webkit blocking: add `--project=webkit` to the
#    "Run fidelity golden tests" step in builder-fidelity.yml.
```

The install step (`npx playwright install chromium webkit`) and the seed step
(`--project=chromium --project=webkit --update-snapshots`) are already wired, so
step 1 seeds webkit automatically.
