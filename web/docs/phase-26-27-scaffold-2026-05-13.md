# Phase 26 + 27 scaffold notes — 2026-05-13

Items 26 and 27 from the messages-pending list are bigger-than-one-file
initiatives. Rather than ship throwaway code, these notes lay out the
**single foundational decision** each phase needs as its entry point.
Both have already-binding memory + plan docs — those are the spec.

---

## Item 26 · Phase F Hybrid + Network (beyond the resolver)

**Already shipped:**
- `lib/identity/hybrid-mode.ts` — `resolveActorIdentity` + helpers + types
- `lib/server-actions/hybrid-identity-self.ts` — server action returning
  topbar-ready props
- `components/hybrid-identity/HybridModeSwitcher.tsx` — 2-pill switcher
- Topbar integration in `pages.tsx` (item #8 final) reading live
  identity on mount

**Still needed (multi-PR initiative):**
1. Talent workspace creation flow — UI for a talent founding their own
   Free Studio. Memory: `project_talent_subscriptions.md` §"Workspace
   provisioning at claim".
2. Plan tier × role permission matrix UI — Workspace Settings page
   showing what each tier permits per role. Memory:
   `project_workspace_talent_hybrid.md` §3.
3. Network tier hub publishing — admins can opt their workspace into
   the Tulala Hub directory. Memory:
   `project_agency_exclusivity_model.md`.
4. Auto-exclusive assignment — when an Agency-tier admin adds a talent,
   the talent's `exclusive_agency_id` gets set. Memory: same as above.

**Foundational decision needed first:**
The hybrid model says a single user can own a Free Studio AND
coordinate on someone else's Agency workspace. Today
`agency_memberships` already supports multiple rows per user. The
remaining decision is: **when the user creates a NEW Free Studio,
does it block them from being a coord on others' workspaces?**
Per memory it doesn't — but the UI needs to make that crystal clear
during workspace-creation onboarding.

**Recommended kickoff:** Fresh Opus-high session, read
`project_workspace_talent_hybrid.md` + `project_agency_exclusivity_
model.md`, draft the workspace-creation flow first (it's the wedge
that unlocks everything else).

---

## Item 27 · Phase E talent surface (profile pages + gallery)

**Already shipped:**
- Public talent route `app/t/[profileCode]/page.tsx` + opengraph image
- Talent subscriptions migration + plan tiers
- Three-layer photo model defined in
  `docs/plans/talent-surface-and-photo-execution-plan-2026-05-08.md`

**Still needed (per binding execution plan):**
The plan document is already authoritative. Future sessions should
work through its 8 phases in order. Specifically:
- Phase 1-2: avatar/hero/gallery upload + crop primitives
- Phase 3: published-profile rendering at tulala.digital/t/<slug>
- Phase 4-5: Pro/Portfolio premium gates (custom domain, advanced
  analytics)
- Phase 6: claim-existing-profile flow
- Phase 7: Hybrid mode integration (talent ↔ workspace, see item 26)
- Phase 8: billing layer (Stripe subscription via existing
  workspace-billing patterns)

**Foundational decision needed first:**
The photo-three-layer system (avatar 1:1 / hero 4:5 / gallery) needs
a single canonical storage path + naming convention before any UI
ships. Suggest: `talent-media/{talent_profile_id}/{kind}/{filename}`
where kind ∈ `avatar | hero | gallery`. Memory:
`project_talent_surface_launch.md` §"Profile photo".

**Recommended kickoff:** Fresh session with the execution plan
loaded. The plan doc is the spec — work through it phase-by-phase.

---

## Status summary across items 25-30

| Item | What landed this session | Next step |
|---|---|---|
| 25 Phase D Trust | Migration: `client_profiles` + verification_status + trust_tier columns | Stripe Identity onboarding flow + verifier engine |
| 26 Phase F Hybrid | (this doc) — primitives already shipped, scaffold decision documented | Workspace-creation flow UI |
| 27 Phase E talent | (this doc) — execution plan referenced | Phase 1-2 upload primitives |
| 28 Search FTS | Migration: `body_tsv` + GIN index + `search_inquiry_messages` RPC | Server action + ThreadSearch backing |
| 29 Notifications | Migration: `notification_dispatch_log` table + `dispatchNotification` stub | Implement dispatcher + per-event matrix |
| 30 WhatsApp/SMS | (shares dispatch log with item 29) | Twilio / Meta provider integration |

Each item now has either a code-foundation in the repo or an
explicit pickup note. Memory pointers + plan docs are the spec for
the next session that tackles each.
