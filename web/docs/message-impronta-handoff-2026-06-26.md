# HANDOFF — Message Impronta unified inquiry → "Jon 360" CRO build (2026-06-26)

> Paste this whole file into a new chat to continue. It explains everything done so far and everything to do next.

## 0. Orientation (read these first)
- Project: **Tulala/Impronta** multi-tenant talent-agency SaaS (Next.js + Supabase + Vercel; app code under `web/`). `main` is canonical (Vercel prod). Live tenant: improntamodels.com (tenant id `00000000-0000-0000-0000-000000000001`, slug `impronta`).
- Your auto-memory index `MEMORY.md` is loaded. **Read `memory/project_message_impronta_inquiry_sync_plan.md`** — it is the full running log of this whole effort.
- Two binding plan docs in the repo:
  - `web/docs/message-impronta-inquiry-sync-plan-2026-06-24.md` — the unified-inquiry feature that already SHIPPED to a branch.
  - `web/docs/jon-inquiry-360-cro-plan-2026-06-26.md` — **the 8-phase plan you are about to build.**

## 1. What we did (story so far)
We turned the floating **"Message Impronta"** launcher on the public directory into ONE unified inquiry experience:
- A guided **chat that IS the inquiry**, synced live to a single inquiry record across guest / client-dashboard / admin Messages / talent.
- A collapsible **"Inquiry details" rail** (icon rail ⇄ labeled checklist) reusing the InquiryDrawer section editors, all on the same synced patch path.
- A **talent avatar-cart on the launcher** ("Book Now"): add a talent from a directory card → its face flies onto the pill (X-to-remove, +N overflow); clicking opens the chat preloaded with those talents; cold-load cart resolves face portraits.
- Renamed the CTA to **"Book Now"** (owner request) and localized en/es/fr.

Then we **audited and remediated** it:
- 5-lens design+QA audit (design-fidelity / a11y / ux / correctness / copy-i18n) → **63/100**, found 4 launch-blockers.
- Remediated all findings (contact-gate-before-send, hub-host slug, rail-remove → patch record, self-edit-note grace, dedup; duplicate-surface collapse, Send-to-agency CTA, SyncStatusBar, mobile compact, accent-contrast clamp, C.inkDim; i18n threaded through 9 components + 119 `public.guestChat` keys × en/es/fr).
- Deep Chrome QA: proved cross-role sync BOTH directions, contact-gate blocks placeholder sends (DB-verified), rail-remove syncs the record (3→2). Found + fixed an i18n-locale gap (agency mount wasn't passing `brand.locale` → panel stayed English; fixed + verified ES "Cuéntanos…" / "Reservar ahora").
- **Re-audit: 72/100** (correctness 60→72, copy 52→84, fidelity →90; a11y 76→72). tsc+lint clean.

### Architecture (what's true now)
- Guest-safe writes EXTEND the cookie-gated `captureGuestChip` path (`web/src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts`) + `ensureGuestChatInquiry` (`guest-chat-actions.ts`). **NO migration. Do NOT touch `inquiry-permissions.ts` or favorites.**
- `web/src/app/t/[profileCode]/_chat/use-unified-inquiry.ts` (one record, debounced patch, fieldState), `use-guest-detail-reconcile.ts` (inbound realtime), `use-mini-chat-send.ts` (send state machine), `InquiryDetailsRail.tsx` / `InquiryDetailRow.tsx`, `LauncherAvatarStack.tsx` / `FlyingAvatar.tsx` / `cart-talent-registry.ts` / `use-resolve-cart-portraits.ts`, `SendToAgencyBar.tsx`, `SyncStatusBar.tsx`. Mounts: `AgencyChatLauncherMount.tsx` (directory) + `TalentProfileChatLauncherMount.tsx` (profile).
- Realtime reuses `web/src/hooks/use-inquiry-realtime.ts`. The four nouns (all already in data, correctly separated): **lineup** (saved_talent / the draft inquiry roster) · **inquiry** (a conversation) · **projects** (multiple inquiries) · **favorites** (client_favorites, separate).

### Git state
- Branch `feat/message-impronta-unified-inquiry`, **PR #690** (base `feat/bl10-p5`, **MERGEABLE**). Commits: `255b1da6d` (feature), `b9f879beb` (remediation), `6b8c015a3` (i18n-locale fix), `493ee11bc` (these plan/handoff docs). **All pushed; PR open against `feat/bl10-p5`; not yet merged.**
- The owner's UNRELATED profile-templates WIP is uncommitted in the working tree (`_atelier/_lumen/_noir/_shared/`, `t/[profileCode]/page.tsx`, profile-pages, talent-profile lib, package.json, registry.ts, deleted talent-site templates). **Never commit that — it is not ours.**
- QA test rows in PROD DB (`c2d933d1`, `2bd87598`, contact_email like `pending-%@guest.impronta`) — purge was blocked by the safety classifier; owner has the scoped SQL. Leave them or owner runs it.

## 2. STEP 0 — how this branch reaches main (CORRECTED after topology check 2026-06-26)
**Do NOT `git merge origin/main` into this feature branch.** An earlier draft of this handoff said to — that was wrong. Verified topology:
- This branch targets **`feat/bl10-p5`** (PR #690 base) and is **0 commits behind it** — already current with its real base. **PR #690 is MERGEABLE into `feat/bl10-p5` with no conflicts.**
- `feat/bl10-p5` is ~51 commits behind `origin/main` (8 unique commits). That bl10-p5→main integration is **already owned by the existing `origin/ship/bl10-p5-onto-main` branch** — not by this feature.
- Merging `origin/main` here directly drags in feat/bl10-p5↔main conflicts that are NOT ours: `web/src/components/edit-chrome/topbar.tsx` (+20/−14 builder-topbar portal fix, 6 conflict regions), the `web/package.json` CI test manifests, `snapshot-tree.test.ts`. Don't adjudicate those — the ship branch does.

Correct path to production:
1. **Merge PR #690 into `feat/bl10-p5`** (clean today).
2. The directory-redesign reconciliation (main's #682/#683/#691/#692 overlap our chat surface) gets resolved **when bl10-p5 → main runs through `ship/bl10-p5-onto-main`** (or when this work is later rebased onto a main-merged base). Apply these resolutions at that point:
   - `web/src/components/directory/directory-infinite.tsx`, `web/src/components/directory/talent-card.tsx` → **take main's DELETE** (legacy files; the directory renders `DirectoryCardAdapter`).
   - `web/src/lib/site-admin/sections/directory/DirectoryCardAdapter.tsx` → **merge both** (our `portraitUrl={card.thumbnail?.url}` + `getInquiryPhotoRect` AND main's editorial trait row — both blocks below the media `<div>`).
   - `web/src/app/t/[profileCode]/_chat/MiniChatPanelColumn.tsx`, `GuestDetailChips.tsx` → **take our rail/unified rewrite** (`--ours`). Main's only delta there is #683's add-details gating, which our rail / `GuestExtraDetailEditors` already supersedes (no dead "Add more details →" 404 for guests).
   - `web/messages/fr.json` → **keep BOTH key sets**: our `public.guestChat` block AND main's `public.contact` block are sibling keys — close `guestChat` with `},` then add `contact`.
   - `directory-discovery-header-actions.tsx`, `en.json`, `es.json`, `talent-directory-list-row.tsx` → auto-merge (verify clean).
3. Repoint the new directory entry points at the CHAT — do this as a **code change on top** (also 360 Phase 3), not as merge-conflict resolution: `directory-inquiry-review-bar.tsx` (#682 `openInquiry()`), `directory-inquiry-url-sync.tsx` (#692 `?inquiry=open` fallback) → the chat launcher; retire `directory-inquiry-sheet.tsx` (#691).
4. Gate every step: `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`.

## 3. STEP 1+ — build the Jon 360 plan
**Read `web/docs/jon-inquiry-360-cro-plan-2026-06-26.md` in full.** It has 8 phases, each with goal/files/acceptance/conversion-mechanism. Headline + spine:
- **DRAFT → SENT → RECEIVED → CONVERSATION lifecycle.** Draft = private autosaved workspace ("Draft. Only you can see this."). SEND = the airlock (clock starts, lineup freezes, "{Maria} has your inquiry"). RECEIVED = an `InquiryReceiptCard` (coordinator name+face, reply ETA, no-payment framing). Conversation = a status strip that always names whose turn it is. (Known fix: the early row wrongly inserts `status:"new"` — should be `draft`.)
- **Lineup-aware CRO:** new pure `web/src/lib/inquiry/inquiry-context-resolver.ts` → 8 states → ONE cross-surface CTA matrix (card / profile / sticky / header / pill). One-tap add (never a modal), never-destroy (auto-park + undo on remove). The **launcher label becomes lifecycle-aware** (empty→"Message {agency}", draft→"Your lineup (N)", sent→"Inquiry sent", replied→"{agency} replied") — this resolves the Book-Now-vs-Message + multi-select-label question.
- **Plus:** look-and-feel/motion/mobile/theming, control & trust, and a ranked funnel-friction sweep. Folds in the re-audit's remaining HIGHs (rail self-echo via routing remove through `useUnifiedInquiry.patch`, portrait 24-cap → targeted uncapped by-id query, focus-visible rings, toggle contrast via `accentText`, localized remote notes).
- Recommended build order = the doc's Phase 1→2 first (draft boundary + the SENT→RECEIVED trust beat — highest leverage), then Phase 3 (collapse front doors + state-aware CTA), then the rest.

## 4. Open product decisions — get owner answers early
- "Book Now" vs the lifecycle-aware label (recommend the latter).
- Rename "cart" → "lineup" in client-facing copy.
- Keep or retire the old `InquiryDrawer` once chat is the surface.
- Honest scarcity/availability signals (yes/no).
- How much to expose the coordinator's name/face.

## 5. Operational playbook (gotchas that bit us — save yourself the pain)
- **Dev/QA locally:** `preview_start "Next.js Dev Server"` (port 3000) + `preview_start "Impronta storefront (impronta.lvh.me)"` (port 3114 host-proxy). QA at **http://impronta.lvh.me:3114/directory**. The proxy rewrites Host→impronta.lvh.me so middleware tenant-resolves + Server Actions don't trip CSRF. The dev server **idles/drops between gaps — just restart it**; if routing breaks or compiles take minutes, **`rm -rf web/.next`** and restart (a 3.5GB stale `.next` wedged it once).
- **tsc:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (OOMs without it). If errors are only in `.next/dev/types/*`, `rm -rf .next/dev/types` and re-run (stale-artifact false positives).
- **Browser QA:** preview_eval/click can't drive the deep React chat state — use the **Chrome MCP (claude-in-chrome)**. The Book Now pill's hit area is partly under the avatars; click the label text. Verify data via the **Supabase MCP** (project `pluhdapdnuiulvxmyspd`). Admin QA: `qa-admin@impronta.test` via passwordless dev-signin `http://localhost:3000/api/dev/signin?email=qa-admin@impronta.test&next=/impronta/admin/messages` (the directory uses the proxy host; admin uses localhost:3000 path-based tenant).
- **House rules (enforced by lint + audits):** no em dashes in user-facing copy; accent via the `color.accent` token / `brand.accentColor`, never hardcoded gold; never "buyer" or "cart" in client copy (use "client"/"lineup"); real imagery or initials medallion, never placeholder boxes; no dead/disabled CTAs; 800-line `max-lines` cap (split god-files per the decomposition pattern); `verify:server-actions` must stay green.
- **Multi-agent / Workflow pattern (ultracode):** run phases as Workflows — understand→design→synthesize, or implement→verify — with per-task model assignment (Sonnet/low for mechanical, Opus/high for load-bearing) and a final verify agent that runs tsc+lint and self-repairs. Watch for: **smart/curly-quote corruption** introduced by edits (verify catches it; convert to straight ASCII), **transient server rate-limits** (the workflow fails fast → just resume it), and **classifier-temporarily-unavailable** on browser/destructive actions (retry shortly; read-only ops are unaffected). Tightly-coupled same-file work is better as one coherent agent than parallel handoffs.
- **Don't:** touch `inquiry-permissions.ts`, favorites, the submit engine, or the owner's profile-templates WIP. No migration is needed for any of this.
