# Maison widget width + Nail Studio Save look

**PR:** [#2528](https://github.com/orantene/impronta-app/pull/2528) · branch `cursor/maison-widget-width-surface-5833`  
**Owner:** [Fix Maison widget width](bc-974a61b2-7ca8-5781-88ed-07f14b035833)

## What changed

1. **Services catalog** — desktop grid honors `--svc-columns` so the list is not a half-width tall column.
2. **Nail band** — drops `surface-raised` white background; full-bleed.
3. **Desktop Nail Studio** — preview-led composition (mobile kept as the good reference).
4. **Save look** — standalone Download removed; modal shows clean square hand (no controls) with Download / Share / Save to ideas / Request a quote / Add to chat.

## Front-chat follow-up

Add to chat / quote currently prefills **text** via `tulala:ask-question`. Attaching the look **image** into front-door chat is owned by [Close front-chat pay gaps](bc-1f5524d8-e177-58a1-acd7-d3f5ee03b3db).

**Update (2026-10-04):** [#2531](https://github.com/orantene/impronta-app/pull/2531) (ready, rebased) owns receive **and** emit — `emitHandoff` posts clean PNG `imageDataUrl` on Quote/Add to chat; dock stashes → chip → moodboard on send. Squash-merge when Structural green. Progress: [`docs/plans/front-chat/03-pay-book-progress.md`](./plans/front-chat/03-pay-book-progress.md) · internal [`front-chat-look-image-2531.md`](../internal/front-chat-look-image-2531.md).

## Verify

- Desktop: services two-column full width; nail band no white card; Save look modal five actions.
- After merge: Builder Lab **Publish and update demos** so theme demos pick up the rebuild.
