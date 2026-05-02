# Prototype freeze contract

**Status:** FROZEN for stabilization
**Frozen as of:** commit `11d8fa0` — `fix(prototype): scroll-lock recovery + black-CTA leak + talent profile polish`
**Date:** 2026-05-01
**Tag:** `prototype-freeze-2026-05-01`
**Phase:** Phase 0 (per [`~/.claude/plans/ancient-gathering-sparkle.md`](../../../docs/handoffs/wave-1-prep-audit.md))

---

## What this means

The prototype at `web/src/app/prototypes/admin-shell/*` is the **UX/design source of truth**. The 5-phase execution plan (Stabilize → Bridge → Unify → Promote → Replace) treats this prototype as a fixed target. Phase 1 begins wiring the design system to live Impronta data; the design itself does not move underneath it.

Until further notice:

1. **No new feature work** in `web/src/app/prototypes/admin-shell/*`. New surfaces, new drawers, new flows, new pages — none of it lands here.
2. **Bug fixes only.** Hot fixes for genuine breakage (rendering failures, broken interactions, accessibility regressions) are allowed.
3. **Every fix commit must explicitly acknowledge the freeze** in its message — e.g., `fix(prototype-frozen): <what>` or include the line `Frozen-fix: yes — <reason>` in the body. This is a discipline gate, not a CI check.
4. **No new mock data, no new stub flows, no copy reshuffles.** The mocks in `_state.tsx` are intentionally stable so Phase 1 can build the bridge against a known shape.
5. **Phase 1 wiring proceeds against this frozen state.** The roster bridge (`_data-bridge.ts` + `?dataSource=live`) reads `_state.tsx` types as fixed. Drift in `_state.tsx` types during Phase 1 will break the bridge.

## What is **not** frozen

- The live admin at `web/src/app/(dashboard)/admin/*` — the data/auth/tenant/capability source of truth. It continues to evolve through Phases 1–3.
- The locked architecture docs at `docs/*` — page-builder-invariants, talent-relationship-model, transaction-architecture, talent-monetization, client-trust-and-contact-controls, taxonomy-and-registration. These are binding and override the prototype on conflict.
- The capability registry at `web/src/lib/access/`. Phase 2 makes it canonical.
- Database schema — additive migrations continue per phase as wiring needs them (no destructive changes until Phase 4).
- The page builder at `web/src/components/edit-chrome/*`. Preserved per `page-builder-invariants.md`; Phase 3.5 integrates it, never rewrites it.

## Unfreeze conditions

This document is updated when one of the following is true:

- **Phase 1 has shipped** (real-data bridge proven against Impronta roster) **and** product wants to iterate on the design again — at that point we either unfreeze, or we replace this freeze with a "design-locked" status that allows targeted polish.
- A discovered drift between prototype and locked architecture requires a structural change to the prototype that cannot be deferred (extremely rare; expect to use a Decision-Log amendment first).
- Major product-direction shift renders the current prototype shape obsolete (would also touch the locked product-direction docs).

When unfrozen, this file gets a new section noting the unfreeze date, the commit at which the prototype is taken off-freeze, and the next phase signal.

## Cross-references

- Plan file: `~/.claude/plans/ancient-gathering-sparkle.md` (canonical 5-phase execution plan)
- Phase 0 audit: [`docs/handoffs/wave-1-prep-audit.md`](../../../docs/handoffs/wave-1-prep-audit.md)
- Operating index: [`OPERATING.md`](../../../OPERATING.md) §12a (active execution plan pointer)
- Locked architecture docs: `docs/page-builder-invariants.md`, `docs/talent-relationship-model.md`, `docs/transaction-architecture.md`, `docs/talent-monetization.md`, `docs/client-trust-and-contact-controls.md`, `docs/taxonomy-and-registration.md`
- Prototype dev handouts entry: `web/docs/admin-prototype/dev-handoff.md`

---

*Owner: founder (orantene@gmail.com). Last updated 2026-05-01 by Phase 0 stabilization commit.*
