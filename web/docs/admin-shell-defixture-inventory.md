# Admin Shell — De-Fixture Inventory (Phase B)

**Created:** 2026-05-28  
**Branch:** `phase-b-defixture-shell`  
**F-codes closed:** F1, F2, F7, F8, F10, F11, F12, F17, F21, F22, F23

---

## Symbol inventory

### `PROTO_TENANT_ID` — `field-catalog.ts:709`

```ts
export const PROTO_TENANT_ID = "tenant.acme-models";
```

Used as default parameter in `validateField` (line 886) and `validateProfile` (line 934). When callers omit `tenantId`, workspace field overrides are looked up under the fake prototype slug instead of the real tenant.

**Decision: REPLACE** — change to `null`. `applyWorkspaceFieldOverride` already handles `!tenantId` gracefully (returns catalog defaults with no overrides). Callers in `light-03.tsx` and `profile-modals.tsx` already compute a real `workspaceScopeTenantId`; just need to pass it to `validateField`.

**Files touched:** `field-catalog.ts`, `drawers/light-03.tsx`

---

### `WEBSITE_STATE.domain.primaryDomain` fallback — `fixtures.ts:4731`

```ts
const host =
  live.domainSummary.primaryHost ??
  live.domainSummary.customDomainHost ??
  live.domainSummary.subdomainHost ??
  WEBSITE_STATE.domain.primaryDomain;   // ← "acme-models.tulala.digital"
```

When a workspace has no domain row (brand-new workspace), the fallback is the prototype domain literal instead of the real subdomain.

**Decision: REPLACE** — pass `tenantSlug: string` into `mergeWebsiteStateFromBridge` and use `${tenantSlug}.tulala.digital` as fallback.

**Files touched:** `state/fixtures.ts`, `state/context.tsx`

---

### `WEBSITE_STATE.analytics` — `fixtures.ts:4640–4716`

The spread `...WEBSITE_STATE` in `mergeWebsiteStateFromBridge` propagates fake analytics: `visits: 4730`, `inquiries: 23`, `bookings: 6`, `revenue: 14500`, and fake per-page/per-talent performance rows ("Marta Reyes", "Kai Lin").

**Decision: REPLACE WITH EMPTY STATE** — zero out all analytics in the merge return (`visits: 0`, empty arrays for `byPage*`/`byTalent*`). `WebsitePerformance` already renders correctly when values are 0 (no top-performer rows rendered because `filter(p => p.visits > 0)` returns `[]`).

**Files touched:** `state/fixtures.ts`

---

### `WEBSITE_STATE.announcement` — `fixtures.ts:4697–4705`

```ts
announcement: {
  enabled: true,
  text: "Casting open for the SS27 capsule — apply by May 30.",
  ...
}
```

The spread in `mergeWebsiteStateFromBridge` carries this into every workspace's website state.

**Decision: DELETE (disabled)** — override `announcement: { enabled: false, text: "", audience: "all", tone: "info" }` in the merge return. Real announcement management is Phase C (page builder).

**Files touched:** `state/fixtures.ts`

---

### `WEBSITE_STATE.tracking.plausibleDomain` — `fixtures.ts:4626`

```ts
tracking: { plausibleDomain: "acme-models.tulala.digital", ... }
```

**Decision: REPLACE** — patched in `mergeWebsiteStateFromBridge` alongside domain using real `tenantSlug`.

**Files touched:** `state/fixtures.ts`

---

### `.tulala.app` literals — `OverviewPage.tsx:52,561`, `SitePage.tsx:233`

```ts
`${bridgeTenantIdentity.slug}.tulala.app`
```

The production hostname is `.tulala.digital`, not `.tulala.app`. Three occurrences.

**Decision: REPLACE** — swap to `.tulala.digital` in all three places.

**Files touched:** `page-modules/OverviewPage.tsx`, `page-modules/SitePage.tsx`

---

### `FREE_PLAN_VALUE` roster `current: 3` — `fixtures.ts:1571`

```ts
used: { current: 3, cap: 5, unit: "talent" },
```

Shown in the Free-plan overview panel ("Today on Free"). Hardcoded count.

**Decision: REPLACE** — `WorkPage.tsx` (the only consumer) computes it dynamically from `effectiveRoster.length`. The global constant keeps its default for standalone demo mode; the component patches the live value.

**Files touched:** `page-modules/WorkPage.tsx`

---

### `FREE_PLAN_VALUE` storefront `detail` — `fixtures.ts:1582`

```ts
detail: "Lives at acme-models.tulala.app.",
```

Shown in the Free-plan overview panel. Hardcoded fake URL.

**Decision: REPLACE** — `WorkPage.tsx` patches `detail` to `` `Lives at ${effectiveTenant.slug}.tulala.digital.` `` when in bridge mode.

**Files touched:** `page-modules/WorkPage.tsx`

---

### `RICH_INQUIRIES` fallback in `CalendarPage` — `CalendarPage.tsx:28,43–58`

```ts
if (effectiveCalendarEvents != null && effectiveCalendarEvents.length > 0) {
  // bridge path
} else {
  RICH_INQUIRIES.forEach(...)   // ← Mango / Vogue Italia / Bvlgari / Estudio Roca
}
```

The admin layout always calls `loadCalendarEvents(tenantId)` which returns `[]` for a new workspace. `effectiveCalendarEvents` is `initialBridgeData?.calendarEvents ?? null` — so `[]` stays as `[]`. But the `length > 0` guard means an empty real array falls into the RICH_INQUIRIES branch.

**Decision: REPLACE** — drop `&& effectiveCalendarEvents.length > 0` from the condition. When bridge is active (non-null) and empty, show the calendar's own empty-day state rather than fictional bookings.

**Files touched:** `page-modules/CalendarPage.tsx`

---

### `useRealData` guard in `NotificationsBell` — `notifications-hub.tsx:172`

```ts
const useRealData = Array.isArray(realNotifications) && realNotifications.length > 0;
```

When bridge returns `[]` (no notifications for a new workspace), fixture items render: "Booking confirmed · Bvlgari", Mango/Vogue Italia inquiry items. This drives both F21 (fixture content) and F23 (badge count showing "7").

**Decision: REPLACE** — change to `Array.isArray(realNotifications)`. An empty real array means "bridge active, no notifications" and should show empty, not fixtures.

**Files touched:** `notifications-hub.tsx`

---

### `WorkspaceActivationBanner` hardcoded defaults — `wave2.tsx:4303–4307`

```ts
done: s.hasCompleteProfile ?? true,   // always "done" when prop absent
done: s.hasAnyTalent       ?? true,   // always "done" when prop absent
```

Standalone mode (no bridge) shows all steps pre-checked regardless of actual state.

**Decision: REPLACE** — change defaults from `?? true` to `?? false` so standalone mode shows honest unchecked state. OverviewPage already passes real values when bridged; the defaults only affect dev/demo mode.

Also: OverviewPage passes `hasCompleteProfile: true` hardcoded (line 128). Change to `bridgeTenantIdentity != null` — workspace has been set up if the bridge resolved its identity.

**Files touched:** `wave2.tsx`, `page-modules/OverviewPage.tsx`

---

### `MOCK_STOREFRONT_STATS.views7d` — `OverviewPage.tsx:166`

```ts
value: overviewMetrics?.storefrontViews7d ?? MOCK_STOREFRONT_STATS.views7d,
demo: overviewMetrics?.storefrontViews7d == null,
```

Already uses `demo: true` flag to visually mark the tile when showing mock data. The stat strip correctly shows the `demo` pill. This is acceptable bridge-mode behavior — the `demo` flag is the intended degraded state until analytics land. **Not blocking.**

**Decision: KEEP AS-IS** — `demo` pill is the correct UX for "real data not yet available".

---

### `NOTIFICATIONS` fixture constant — `fixtures.ts:1922+`

Contains Vogue Italia, Bvlgari, etc. Only referenced by the old drawer-based notification flow. `NotificationsBell` already switched to `bridgeUserNotifications`; the old NOTIFICATIONS constant is only used in dev/prototype flows that bypass the bridge.

**Decision: KEEP IN FIXTURE** — no production surface reads it in bridge mode after the `useRealData` fix. Mark as deprecated; purge in Phase E cleanup.

---

### `RICH_INQUIRIES` in `effectiveMessagesInquiries` — `context.tsx:1633–1638`

```ts
bridgeInquiries != null ? bridgeInquiries.map(adaptBridgeInquiry) : RICH_INQUIRIES,
```

Already correctly bridge-first. New workspaces get `[]` from the layout → `bridgeInquiries = []` → empty array, not RICH_INQUIRIES. **Not a bug.**

**Decision: KEEP AS-IS**

---

### `TENANT` constant fallback — `context.tsx:1697`

```ts
if (!bridgeTenantIdentity) return TENANT;
```

Used in standalone/dev mode when no bridge. `TENANT.domain = "acme-models.tulala.digital"` — but this branch only fires when there is no `bridgeTenantIdentity` (i.e. the shell is opened without the workspace layout, which never happens in production). **Not a production bug.**

**Decision: KEEP AS-IS** — standalone dev mode is intentional.

---

### `ACTIVATION_TASKS` — `fixtures.ts:1429–1441`

Static list of task definitions (labels, hints, drawers). Does not contain fixture data — just configuration. The completion state is computed from real context (`effectiveRoster.length`, etc.) in both `OverviewFree` and `WorkspaceActivationBanner`.

**Decision: KEEP AS-IS**

---

## Change summary by file

| File | Change | F-codes |
|---|---|---|
| `field-catalog.ts` | `PROTO_TENANT_ID = null` | F1 |
| `drawers/light-03.tsx` | Pass `workspaceScopeTenantId` to `validateField` | F1 |
| `state/fixtures.ts` | `mergeWebsiteStateFromBridge(live, tenantSlug)` — fix domain fallback, zero analytics, disable announcement | F2, F10, F11, F12 |
| `state/context.tsx` | Pass slug to `mergeWebsiteStateFromBridge` | F2 |
| `page-modules/OverviewPage.tsx` | `.tulala.digital` (×2), `hasCompleteProfile` real signal | F2, F22 |
| `page-modules/SitePage.tsx` | `.tulala.digital` | F2 |
| `page-modules/CalendarPage.tsx` | Drop `&& length > 0` guard | F7 |
| `page-modules/WorkPage.tsx` | Dynamic roster count + storefront URL in free-plan panel | F8, F17 |
| `notifications-hub.tsx` | `useRealData = Array.isArray(realNotifications)` | F21, F23 |
| `wave2.tsx` | `?? false` defaults in activation steps | F22 |
