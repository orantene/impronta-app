# Messaging Shells — Dev Handoff

Living spec for the messaging surface across the three roles (Talent / Client / Workspace Admin) and four workspace plan tiers (Free / Studio / Agency / Network). Documents what was built in the prototype rounds covered here and the engineering scaffolding needed to ship to production.

> **Source:** All prototype code lives in `web/src/app/prototypes/admin-shell/_messages.tsx` (~13.1k lines, single-file by design — keeps the iteration loop tight). Supporting modules in the same `web/src/app/prototypes/admin-shell/` directory: `_state.tsx` (types, mock data, plan model), `_talent.tsx` (Conversation type + MOCK_THREAD), `_wave2.tsx` (TenantSwitcherDrawer + WorkspaceProfileDrawer + presence atoms), `_drawers.tsx` (drawer router).

---

## 1. Architecture overview

### 1.1 Three shells, one design language

| Shell | File entry | Inbox row | Detail container | Merged info tab |
|---|---|---|---|---|
| Talent | `TalentJobShell` | `TalentJobRow` | `TalentJobDetail` | `TalentBookingTab` ("Details") |
| Client | `ClientProjectShell` | `ClientProjectRow` | `ClientProjectDetail` → `ClientTabsBlock` | `ClientProjectViewTab` ("Project") |
| Workspace (admin) | `AdminOperationsShell` | `AdminInquiryRow` | `AdminInquiryDetail` | `AdminBookingTab` ("Project") |

All three use the same `ShellHeader`, `ThreadTabBar`, `ConversationTab` (or its admin counterpart `AdminMessageStream`), `OfferTab`, `LogisticsTab`, `FilesTab`, `PaymentTab`. Tab list is built by a single shared helper `buildInquiryTabs({ status, pov, planTier, ... })`.

### 1.2 Plan tier model

Type lives in `_state.tsx`:

```ts
export type Plan = "free" | "studio" | "agency" | "network";
```

The Plan flows from URL (`?plan=…`) → `useProto().state.plan` → drives:
- Inbox dataset (`getInquiries(plan)` etc.)
- Tab list contents (admin Talent group hides on Free)
- Add-talent picker tabs (Free hides Circle; Network adds Network roster)
- Reassign coordinator availability (Free hides; paid surfaces with upgrade nudge)
- Workspace identity tier badge (Free/Studio/Agency/Network with canonical color palette)

Color palette ratified by user — keep consistent everywhere a tier surfaces:
- **Free**: neutral (`rgba(11,11,13,0.06)` bg / `inkMuted` fg)
- **Studio**: amber-warm (`rgba(214,158,46,0.14)` bg / `#9C6B14` fg)
- **Agency**: indigo (`rgba(91,107,160,0.16)` bg / `#3B4A7C` fg)
- **Network**: emerald (`rgba(46,125,91,0.16)` bg / `#1F5C40` fg)

### 1.3 Role permission ladder

Type lives in `_state.tsx`:

```ts
export type Role = "viewer" | "editor" | "coordinator" | "admin" | "owner";
```

Use `meetsRole(state.role, "coordinator")` for permission gates. Currently wired into:
- **Add talent** → requires `coordinator+`
- **Reassign coordinator** → requires `admin+` AND paid plan AND existing coord
- **Workspace identity edits** (in WorkspaceProfileDrawer) → requires `owner` or `admin`
- **Plan + custom domain edits** → requires `owner`

### 1.4 Multi-workspace identity model

A user can simultaneously be **Owner** of a Free workspace they founded, **Coordinator** in someone else's Agency workspace, and **Admin** in a Network hub. The `TenantSwitcherDrawer` (`_wave2.tsx`) renders these grouped by role-class with helper subtext per group. Each workspace surfaces:
- Tier badge (Free/Studio/Agency/Network palette)
- Domain line (e.g. `atelier-roma.tulala.digital` or `tulala-hub.com/marta` for Free) with copy + open-in-new-tab icons
- Seat meter (`M/N` or `M/∞`) — owner-only signal with red/amber/green tone ladder
- Star pill identifying the user's role

**Anti-abuse rule**: a user can only OWN one Free workspace. Creating a second Free requires upgrading the existing one to a paid tier. Enforced in the create-workspace footer with an amber explainer pill.

---

## 2. System User (workspace-as-participant)

The most foundational addition. The workspace itself (Atelier Roma / Acme Models / etc.) appears in chat as its own sender, distinct from any individual user.

### 2.1 Type extensions

```ts
// _talent.tsx
type ConvSender = "you" | "client" | "coordinator" | "agency" | "workspace";

// _state.tsx
export type MessageSenderRole = "client" | "coordinator" | "admin" | "talent" | "system" | "workspace";
```

### 2.2 Identity helper

`getWorkspaceIdentity(agencyName)` in `_messages.tsx` returns a `WorkspaceIdentity` with name / initials / logoUrl / planTier / slug / signature. Backed by a `WORKSPACE_REGISTRY` of seeded workspaces (Atelier Roma, Acme Models, Praline London, Reyes Movement Studio); falls back to a synthesized identity when an agency isn't pre-registered.

### 2.3 Bubble rendering

When `m.sender === "workspace"`:
- Avatar uses workspace initials + ink tone
- Sender header shows the workspace name + a tiny indigo `★ SYSTEM` pill so recipients know it's the agency speaking, not an individual
- For Network referrals (when `conv.source.kind === "agency-referral"` and the referring agency differs from the sender), an additional emerald `↔ {ReferringAgency}` pill surfaces alongside

### 2.4 Send-as workspace toggle

`DraftComposer` accepts `workspaceName`, `canSendAsWorkspace`, `onSendAsWorkspace` props. When all three are set, a small "SEND AS · You / {Workspace}" toggle row appears above the input. Selecting workspace and sending pushes the message into the local stash with `sender: "workspace"`.

Gating: `meetsRole(state.role, "coordinator") && state.plan !== "free"` (coord+ on a paid tier — Free workspaces ARE the owner so the abstraction is meaningless).

Resets to "You" after each send so workspace attribution stays intentional.

### 2.5 Production wiring required

- Replace `WORKSPACE_REGISTRY` with a real workspaces table query keyed by workspace_id
- Persist `system_user_signature` + `send_as_enabled` per workspace
- Add audit log row when a coord posts as the workspace (compliance)
- Real workspace logo upload (currently the WorkspaceProfileDrawer "Upload logo" button is a placeholder)

---

## 3. Inbox row template

All three rows now share the same 4-row silhouette (different content per role):

```
[Avatar] [Title bold] [NEW pill] [age]
         [Subtitle · meta]                     [Source chip]
         [Status / preview]                    [Unread badge]
         [Funnel dots] [STAGE] [right-chip]
```

Per role:
- Talent: Title = client name; right-chip = take-home rate
- Client: Title = brief; subtitle leads with `via {Agency}`; right-chip = coordinator avatar+name
- Admin: Title = brief; subtitle leads with client; meta has lineup `M/N` pill (red/amber/green) + source chip; right-chip = coord owner avatar+name; `ClientTrustBadge` overlays the avatar

Atoms shared across all 3:
- `<NEW pill>` — coral, when `seen === false && !isLocallySeen(id)` OR `isManualUnread(id)`
- `<sourceChipMeta>` — Tulala Hub / Direct / Referral / IG DM / Cold email — same palette across shells
- `<JobStageFunnel>` — 4-dot funnel (Inquiry → Offer → Booked → Wrapped)
- `<InboxRowHoverActions>` — Pin / Mark unread / Archive on hover (desktop)
- Date-group headers via `renderWithDateGroups()` (Today / Yesterday / This week / Older)
- `<HoverActionsCss>` injected once at the top of each list pane

### 3.1 Pin + manual-unread store

```ts
// _messages.tsx
type ConvFlags = { pinned?: boolean; manualUnread?: boolean };
const __convFlags: Record<string, ConvFlags> = /* hydrates from localStorage */;
export function isPinned(id: string): boolean;
export function isManualUnread(id: string): boolean;
export function togglePin(id: string);
export function toggleManualUnread(id: string);
```

Pinned conversations float to the top via `sortPinnedFirst(items)` applied at each shell's row map. Pinned rows show their hover-actions cluster always (so unpinning doesn't require re-hovering). Manual-unread overrides locally-seen state so the row reads as unseen even after being opened.

Persisted to `localStorage` under key `tulala.proto.convFlags.v1`. SSR-safe (returns empty when window is undefined).

### 3.2 Production wiring required

- Replace localStorage with per-user `conv_flags` table (user_id × conv_id × {pinned, manual_unread, archived_at})
- Wire archive toast to a real archive mutation that filters from the default view
- Add admin-side "show archived" toggle in inbox

---

## 4. Detail tab (Project / Details)

Identical card-grid silhouette across all 3 shells (`AdminBookingTab` / `ClientProjectViewTab` / `TalentBookingTab`):

1. **Action hero** — coral/amber "Your move · {action}" CTA, OR green "On set in N days" countdown when no action is owed and a shoot is within 14 days
2. **Project / Job card** — title, brief summary, source chip, optional brief.notes, and the **coord-team read** quote block (indigo, italic, with the coord's first name)
3. **When + Where** 2-up (Where uses `LocationMapTile`)
4. **Lineup card** — talent rows + tone-laddered count pill + role-appropriate actions:
   - Talent: "Who's on this job" / "On this job" (solo coord case shows "Invite a teammate" CTA)
   - Client: "Your talent" + Add talent + per-row Swap (uses `ClientTalentCard` with `onSwap` callback)
   - Admin: "Lineup" / "On this job" (Free) + `<AdminParticipantsActions>` (Add talent + Reassign coordinator + tier-aware upgrade nudge)
5. **Coordinator card** — avatar with `<PresenceDot>` + name with `<CoordRoleBadge>` (Owner star pill) + `<CoordWorkloadPill>` (admin-only) + role label + Message CTA
6. **Files preview** — top-3 files with extension-aware icons (image / archive / spreadsheet / calendar / doc) + "View all" footer when overflow
7. **Notes** — per-conv textarea persisted via `__notesStash` (in-memory, prototype only)

The two heavy pieces below (Lineup drawer, Reassign sheet) are also shared.

### 4.1 LineupDrawer + AddTalentPicker

`<LineupDrawer>` is a centered modal (mobile bottom-sheet via media query) showing all lineup members with state pills + per-row actions (View profile, Remove). Footer has "Add talent" → opens `<AddTalentPicker>`.

`<AddTalentPicker>` tabs are pov + tier aware:
- `pov="client"`: Favorites / Recent / All Tulala
- `pov="admin"|"talent_coord"`:
  - Free: Saved / All (Circle hidden — no team)
  - Studio: Saved / Circle / All
  - Agency: Workspace roster / Circle / All Tulala
  - Network: Workspace roster / Circle / All Tulala / Network roster (new 4th tab — cross-agency federation)

### 4.2 ReassignCoordinatorSheet (admin only)

Modal with workspace coordinator picker (avatars + workload + availability), required handoff note textarea, opt-out for notifying outgoing coord. On submit:
1. Toasts confirmation
2. Appends a system event to the inquiry timeline
3. Calls `recordHandoff(...)` so the receiving coord sees an "Incoming handoff" indicator

### 4.3 Coordinator handoff queue

Module store at `__handoffStash` with selectors `getIncomingHandoffs(coordName)`, `recordHandoff(...)`, `clearHandoff(...)`. AdminInboxList renders a star-pinned "Handoffs · N" filter chip when the user has incoming entries. Production note: clear the entry when the receiving coord opens the row (not currently wired).

### 4.4 ChangeCoordinatorSheet (client only)

Three soft options that respect the agency relationship:
- Request a different coordinator (warning tone)
- Add a backup coordinator (neutral)
- Send a private note to the agency (neutral)

Distinct from the admin's hard `ReassignCoordinatorSheet` — clients don't directly reassign; they request.

### 4.5 Production wiring required

- Lineup add/remove: wire to a real `inquiry_talent` mutation
- Reassign: actually move project ownership in `inquiry.coordinator_id`; emit notification to incoming + outgoing coord
- Network roster picker: needs a real federated talent index across agencies

---

## 5. Conversation thread (chat)

`ConversationTab` (talent + client) and `AdminMessageStream` (admin) share the same design language:

- Day separators between message clusters (`<DaySeparator>`)
- Per-bubble sender avatar + name + role tag
- Workspace bubbles (System User) render with workspace identity + indigo `★ SYSTEM` pill + (in Network) the referring agency pill
- Closure-aware composer: replaces with a closure pill when `conv.stage === "cancelled" | "past"` (or admin's `inquiry.stage === "rejected" | "expired"`)
- Stage-aware smart-reply chips (`SMART_REPLIES_FOR_LAST` keyed by `inquiry/hold/offer/default`)
- Send-as toggle (Phase 4 of System User)
- Read-receipt double-check on own bubbles

### 5.1 In-thread search

Each ConversationTab now has a search-toggle button next to the TeamStrip. Clicking opens a compact input that filters visible bubbles to those matching the query. Esc clears + closes. Match count is shown beneath the input.

System events stay visible during search (they often anchor the date context).

### 5.2 First-time conversation banner

`<FirstConvBanner>` surfaces above the message stream when the conversation is the user's first with this client. Detection via `isFirstConvWith(clientName)` against a hardcoded `FIRST_TIME_CLIENTS` set (Aesop / Lacoste / Tequila Olmeca / Eden Hotel / Lyra Skincare / Estudio Roca / Praline London).

Three audience framings:
- Talent: "First time you'll work with this client. Lock the brief + usage scope early."
- Admin: "First inquiry from this client. Confirm scope + budget early — no priors to anchor on."
- Client: "Welcome — first project together. Let your coordinator know your usual cadence."

### 5.3 Composer (DraftComposer)

- Draft persistence via `__draftStore` (per `threadKey`)
- Smart replies (collapsible, opens on sparkle button)
- Send-as toggle (when wsAvailable)
- Voice-record + file-attach buttons (currently placeholders — toast)

### 5.4 Production wiring required

- Real-time message delivery (websocket / SSE)
- @mentions notification routing
- Voice + file upload pipeline
- Real per-recipient read receipts
- Replace `FIRST_TIME_CLIENTS` set with a real "first conversation between {sender, recipient}" check

---

## 6. Files tab

`FilesTab` (shared by all 3 shells, scoped by `povCanSeeTalentFiles`):

- Files grouped by source thread (Client thread / Team / Internal coord) with eyebrow headings when both sides have content
- Extension-aware icon + color per file type:
  - Images (jpg/png/heic/webp/gif) — indigo
  - Archives (zip/rar/7z/tar/gz) — amber
  - Spreadsheets (csv/xlsx/numbers) — emerald
  - Calendar (ics) — coral
  - Default (pdf/etc.) — neutral
- Add-file uploader at top (currently placeholder)
- Files preview (top-3 + "View all") also embedded in `ClientProjectViewTab` and `AdminBookingTab`

Seeded files exist for c1–c12 (every demo conv has at least one file).

### 6.1 Production wiring required

- Real CDN-backed thumbnail rendering for image files (currently shows the photo glyph)
- File picker → upload pipeline
- Per-file permissions (some files visible to client only, some internal)

---

## 7. Live presence + workload

`usePresence(name)` returns `"online" | "away" | "offline"` deterministically hashed from the name. `<PresenceDot>` overlay sits on coord avatars across all 3 shells.

`<CoordWorkloadPill>` (admin-only on the AdminBookingTab Coordinator card) shows active project count with red/amber/green tone ladder.

`<CoordAvatarPopover>` is a hover/focus mini-card atom (built but not yet wired into all surfaces) showing name + role + presence + workload + last-seen + Message CTA.

### 7.1 Production wiring required

- Replace deterministic mock with real presence service (websocket heartbeat + last-seen timestamp)
- Workload count from real query against `inquiry.coordinator_id` filtered to active stages
- Wire `<CoordAvatarPopover>` everywhere coord avatars surface (currently used selectively)

---

## 8. WorkspaceProfileDrawer

New drawer registered as `drawerId === "workspace-profile"` in `_drawers.tsx`. Opened from the `<TenantSwitcherDrawer>` toolbar's "Edit profile" button.

Sections:
1. Identity hero — workspace avatar + name + tier pill + your-role indicator (tier-tinted background)
2. Identity — name input, slug input (with live URL preview), logo upload
3. Plan + billing — current tier card with seats used + Upgrade/Manage CTA (owner-only)
4. **System User** — toggle on/off, outbound signature, Free-tier explainer
5. Default coordinator — who picks up unassigned inbound inquiries
6. Members + roles shortcut → Manage button (currently toasts; production target: a Members page)
7. Custom domain — Agency + Network only

Permission gating:
- Identity edits: Owner or Admin
- Plan + Custom domain: Owner only
- Other roles see a read-only notice

### 8.1 Production wiring required

- Persist workspace settings to a real `workspaces` table
- Slug uniqueness check on save (currently allows any input)
- Members management page (link target exists; page itself doesn't)
- Custom domain DNS verification + SSL provisioning workflow

---

## 9. Bulk actions

Admin inbox has a "Select" toggle pill that flips into bulk-select mode. Each row gets a checkbox; floating dark action bar appears at the bottom showing count + Nudge / Archive / Reassign buttons.

Talent + Client inboxes do NOT yet have bulk select — see future-work section.

---

## 10. Tier-aware behavior summary

| Surface | Free | Studio | Agency | Network |
|---|---|---|---|---|
| Add talent picker tabs | Saved · All | Saved · Circle · All | Workspace roster · Circle · All Tulala | Workspace roster · Circle · All Tulala · Network roster |
| Reassign coordinator | Hidden + amber upgrade nudge | Available | Available | Available |
| Talent group tab (admin) | Hidden | Visible | Visible | Visible |
| Lineup card title | "On this job" | "Lineup" | "Lineup" | "Lineup" |
| Notes label | "Notes" | "Internal notes (coord only)" | "Internal notes (coord only)" | "Internal notes (coord only)" |
| Send-as workspace toggle | Hidden | Coord+ | Coord+ | Coord+ |
| TenantSwitcher tier badge | Neutral | Amber | Indigo | Emerald |
| Seat meter (owner-only) | 1/5 | M/15 | M/50 | M/∞ |

---

## 11. Demo data

### 11.1 Conversations + threads
- `MOCK_CONVERSATIONS` (in `_talent.tsx`) — c1 to c12 + m6/m7/m8 + g3/g4 — talent + client side conversations
- `MOCK_THREAD` — message arrays per conv id (or `cN:client` / `cN:talent` for split threads)
- `RICH_INQUIRIES` (in `_state.tsx`) — RI-201 through RI-210 — admin-side conversations with structured `messages: ThreadMessage[]`
- `INQUIRY_TO_CONV_GLOBAL` maps RI-* → cN for cross-shell routing

Workspace-attributed messages seeded on c1, c2, c3, c5, RI-209, RI-210 (visible System User pill).

### 11.2 Files
`MOCK_FILES_FOR_CONV` covers c1–c12. Each file has `name / size / addedBy / addedAt / thread`.

### 11.3 Workspaces
`WORKSPACE_REGISTRY` in `_messages.tsx` — Atelier Roma, Acme Models, Praline London, Reyes Movement Studio. Tenant switcher mock (`MOCK_TENANTS` in `_wave2.tsx`) covers a multi-workspace user (Owner of Atelier Roma + Marta solo Free, Coordinator at North Coast Talent, Admin at Vela Hub).

### 11.4 Future demo data needed
- `INQUIRIES_STUDIO` + `INQUIRIES_NETWORK` — currently those plans read `INQUIRIES_AGENCY`
- `ROSTER_STUDIO` + `ROSTER_NETWORK`, `TEAM_STUDIO` + `TEAM_NETWORK`
- More conversations seeded as "first time with X" so the FirstConvBanner shows on more paths

---

## 12. Module-level stores (in-memory, prototype only)

All keyed by conv id, all subscribe-pattern with `useXyzSubscription()` hooks for re-render. Production should replace with real backend calls or a state-management library (Zustand / Redux).

| Store | Purpose | Persisted? |
|---|---|---|
| `__offerOverrides` | Cross-shell offer mutations (admin Send-to-client → client sees it) | No |
| `__notesStash` | Per-conv coordinator notes | No |
| `__locallySeenConvs` | Rows opened in this session (clears NEW pill) | localStorage `tulala.proto.seenConvs.v1` |
| `__convFlags` | Pinned + manual-unread per conv | localStorage `tulala.proto.convFlags.v1` |
| `__handoffStash` | Coordinator handoff queue (incoming entries per coord) | No |
| `__localMsgStash` | Locally-sent messages per thread (sender = "you" or "workspace") | No |
| `__draftStore` | Composer drafts per thread | No |

---

## 13. Files touched in this round

Primary: `_messages.tsx` (~13.1k lines after these rounds — single file by design; verified `wc -l` on 2026-05-02)
Secondary: `_state.tsx`, `_talent.tsx`, `_wave2.tsx`, `_drawers.tsx`, `_pages.tsx`, `_notifications-hub.tsx`

All paths above are relative to `web/src/app/prototypes/admin-shell/` — the prototype source directory.

---

## 14. Future work — explicitly NOT built

Marked clearly so dev knows what to scope next:

### High-leverage quick-wins
- **Bulk select on Talent + Client inboxes** — admin pattern exists; port to `TalentJobInbox` + `ClientProjectInbox`
- **Mobile swipe gestures** on inbox rows — swipe-left archive / swipe-right pin (touch event handler on the row container)
- **`<CoordAvatarPopover>` wiring** — atom is built, wire it everywhere a coord avatar appears (TeamStrip, message bubble, lineup row, Coordinator card)
- **More workspace-attributed system messages** — only ~6 convs have one today

### Structural / mid-effort
- **Reply-to-message threading** — add `replyTo: messageId` field, render quoted parent above the body, expose a Reply gesture on bubble hover
- **@mentions notification surface** — `renderWithMentions` parses today; need a notification entry in `NotificationsBell` + an "@mentioned me" filter chip in inbox
- **Workspace Members page** — currently a stub link in WorkspaceProfileDrawer. Needs a matrix of `members × roles × last activity` with invite + remove + role-change flows
- **Real Studio + Network demo datasets** — INQUIRIES_STUDIO + INQUIRIES_NETWORK so plan-switching shows visibly different inboxes
- **Coord handoff queue clear-on-open** — `clearHandoff(inquiryId, coordName)` exists but isn't called when the receiving coord opens the conv

### Bigger lifts (real product)
- **Custom domain wizard** — referenced from WorkspaceProfileDrawer; needs DNS verification + SSL workflow
- **Plan upgrade / billing flow** — currently toasts only
- **Per-recipient read receipts** in group threads
- **Audit log** for System User posts (compliance signal — who posted as the workspace and when)
- **Real file upload + voice recording**
- **Cross-conv keyboard shortcuts** (`k/j` row nav, `cmd+enter` send, etc.)
- **Cold-start onboarding** — first-run tooltips, empty-state CTAs
- **SLA tier-differentiation** — different freshness thresholds per plan + admin SLA dashboard

### Backend / data layer
- Replace all `__xxx` module stores with real persistence (table + websocket sync)
- Wire `recordHandoff` / `clearHandoff` to a `coordinator_handoffs` table
- Replace `WORKSPACE_REGISTRY` lookup with a real workspaces table
- Replace `usePresence` mock with real presence service
- Replace `getCoordWorkload` mock with a real `count(*) where coordinator_id = ? and stage in active`
- Workspace `system_user_signature` + `send_as_enabled` settings persisted per workspace
- `conv_flags` table for pin / manual-unread / archive (currently localStorage)
- Audit log table for "send as workspace" posts

---

## 15. Recommended ship order (engineering)

1. **Backend foundations first** — workspaces, members, conv_flags, handoffs tables. Without these, everything else is fake.
2. **Presence + workload** — real signals beat mock; the prototype's mock is convincing because it's deterministic, but real data is the unlock.
3. **Real-time message delivery** — replace local-stash with websocket pub/sub.
4. **Files pipeline** — upload + thumbnail rendering. Files tab is currently a list of mock entries.
5. **System User audit log** — compliance-grade requirement before turning on send-as-workspace in production.
6. **Members management page** — needed to actually exercise the role ladder we built UI for.
7. **Then** layer the deferred UX work: bulk on talent+client, mobile swipe, reply threading, @mentions surface.
8. **Last** the bigger product surfaces: billing flow, custom domains, network federation.

---

## 16. Open product questions

These need a product call before building:

1. **SLA thresholds per tier** — Free 24h overdue / Studio 12h / Agency 6h / Network 2h? Or flat?
2. **Studio coord cap** — 2 max in Reassign sheet, or just billing-side enforcement?
3. **Network "Network roster" content** — what cross-agency talent shows up? Federated index data model TBD.
4. **Admin role split** — currently `admin` is a tier on the role ladder; the workspace switcher mock shows it as a distinct membership type. Do we want Admin as a first-class role with permissions strictly between Coordinator and Owner (recommended), or treat it as Owner-equivalent for now?
5. **Handoff queue clear behavior** — clear on coord open? On message reply? Manual dismiss button?
6. **Free workspace cap** — currently one Free workspace per user enforced. Do we want exceptions for special roles (employees / partners)?
