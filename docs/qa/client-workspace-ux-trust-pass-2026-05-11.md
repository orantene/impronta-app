# Client + Workspace UX Trust Pass — 2026-05-11

## Scope

Follow-up to the talent-surface close-out audit. This pass focused on launch-facing client and shared inquiry-workspace flows where disabled controls made unavailable actions look nearly shippable.

## Changed

- Client Today now routes primary actions to real pages: `Messages` and `Browse talent`.
- Removed the dead verification nag, inline accept/counter chips, Send New Inquiry header action, saved-search creation chip, save-talent buttons, calendar subscribe button, PDF download links, team invite footer, add-profile button, save-preferences footer, quick-question send footer, budget save footer, and dormant concierge component.
- Relabeled inquiry creation entry points as draft-oriented where the send action is still intentionally disabled.
- Shared inquiry workspace now hides disabled action-banner CTAs, Mark Read, file preview/download/replace/restore controls, coordinator reassignment, Add Talent, Build Offer, offer decision CTAs, Open Booking / Convert Booking CTAs, and the stale send-message keyboard shortcut.
- Removed remaining `prototype` wording from the touched client/workspace files.

## Still Intentional

- Client inquiry composer is draft-only until a real send action exists.
- Workspace message composer is draft-only; the UI says sending is not wired.
- Settings can still show a muted Coming Soon section because those rows are roadmap visibility, not primary task CTAs.
- Contact gating still disables Draft Inquiry for restricted talent.
- Notifications without a conversation id remain non-navigable.

## Next Best Work

1. Wire real client inquiry creation/send from Discover, shortlists, repeat booking, and client drawer entry points.
2. Wire message sending in the shared inquiry workspace, including read-state behavior.
3. Add real offer accept/decline/counter server actions for client and talent POVs.
4. Persist saved searches/shortlists before reintroducing Save buttons.
5. Add contract/file download endpoints before restoring file action buttons.

## Verification

- `npm run typecheck`
- `npm run lint`

