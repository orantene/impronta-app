# Phase 0 Deliverable 4 — Settings Inheritance Spec

**Purpose.** Define how every setting value is resolved at read time, and how each setting key is classified for write authority. Phase 3 uses this spec when it wires `resolveSetting(key, tenantId, context)` and writes the read-side inheritance chain. Phase 2 uses the mutability classes when it writes the capability guards.

**Sources.** Plan §13 (Settings Inheritance), §4 (`agencies.settings` + `settings` table), §4.5 (settings splitting rules), §7 (Template separation of concerns), §10 (AI tenancy rules for feature flags). Locks: L8, L12, L16, L37.

---

## 1. The precedence stack (Plan §13)

Highest precedence wins. A read of `getSetting(key, { tenantId, contextId })` walks the stack top-down and returns the first hit.

```
┌──────────────────────────────────────────────┐
│ 1. Hardcoded platform safety defaults        │ non-overridable
├──────────────────────────────────────────────┤
│ 2. Plan-level defaults                       │ from agency_entitlements
├──────────────────────────────────────────────┤
│ 3. Template-level defaults                   │ from template config
├──────────────────────────────────────────────┤
│ 4. Platform global setting                   │ settings WHERE tenant_id IS NULL
├──────────────────────────────────────────────┤
│ 5. Agency override                           │ settings WHERE tenant_id = agency.id
├──────────────────────────────────────────────┤
│ 6. Page / content-level override             │ where the key opts in
└──────────────────────────────────────────────┘
```

### Layer 1 — Hardcoded platform safety defaults

Compiled into the app. Cannot be overridden by data, even by `super_admin`. These are the irreducible guarantees of the platform.

Examples:
- `security.session.maxLifetimeDays = 30` — hard ceiling.
- `security.auth.requireTwoFactorForPlatformRoles = true`.
- `hub.serializer.denyOverlayKeys = true` (Plan §24 enforcement stack).
- `tenant.resolution.failHardOnAmbiguous = true` (L37, Plan §22.7).

Changing a Layer 1 default is a code change + Decision Log entry, not a setting write.

### Layer 2 — Plan-level defaults (from `agency_entitlements`)

Plan §4. The plan a tenant is on defines the capability surface *and* default values for plan-gated toggles.

Examples:
- `ai_enabled` — boolean on entitlements row.
- `max_staff_count`, `max_active_roster_size`, `max_domains`, `max_locales`, `max_custom_fields`.
- `advanced_analytics`, `white_label_email`, `custom_css_allowed`.
- `hub_participation_allowed`.
- `support_tier` (`standard` / `priority` / `enterprise`).

Write authority: platform only. An agency cannot raise its own plan limit — that's what Phase 8 billing does.

### Layer 3 — Template-level defaults (from template config)

Plan §7. The template the agency picked contributes defaults for:

- Allowed sections + section defaults.
- Default storefront navigation.
- Default CMS page set + their content schema.
- Default inquiry form configuration.
- Default supported locales.
- Default feature flag set for the template.

Write authority: platform. Agencies pick from available templates; agency cannot edit template structure (config-driven only in V1 — L12).

### Layer 4 — Platform global setting (`settings` WHERE `tenant_id IS NULL`)

The platform-wide default for a setting key. Zone 1 (platform core).

Examples:
- `notifications.digest.defaultFrequency = 'daily'`.
- `seo.sitemap.maxUrlsPerFile = 50000`.
- `cms.revisions.keepDrafts = 20`.
- `directory.pagination.defaultPageSize = 24`.

Write authority: `super_admin` / `platform_admin`, per each key's mutability classification.

### Layer 5 — Agency override (`settings` WHERE `tenant_id = agency.id`)

The agency's chosen value. Zone 2 for keys classified `editable_by_agency`. Read-only for agencies when the key is `locked_by_platform`.

Write authority: per capability + per mutability (see §2). Always gated by `manage_agency_settings` as a base requirement.

### Layer 6 — Page / content-level override

Reserved for keys that explicitly opt in. Not every key can be overridden at content level.

Example candidates (for future):
- `seo.page.noindex` — per CMS page flag overrides site-level default.
- `directory.page.filterPanelVariant` — per directory page overrides agency-level sidebar config.

Write authority: whoever owns the content (`edit_cms_content`, etc.).

---

## 2. Mutability classifications (Plan §13)

Every setting key in the registry carries one mutability class. This is what the Phase 2 capability guard reads to decide "can this actor write this key?"

| Class | Meaning | Who can write |
|---|---|---|
| `locked_by_platform` | Non-overridable at agency layer (security, compliance) | `super_admin` only; writes at Layer 4 |
| `editable_by_agency` | Agency can freely override within the hardcoded/plan bounds | `manage_agency_settings` + (key-specific capability if any) at Layer 5 |
| `plan_gated` | Editable by agency only on plans where entitlements permit | `manage_agency_settings` + `agency_entitlements` check at Layer 5 |
| `request_based` | Agency can request; platform approves | Agency submits a settings change request; `super_admin`/`platform_admin` approves; write lands at Layer 5 |

### Classification discipline

- A new setting key **must** declare its class in the registry at creation time. No ambiguous keys.
- `locked_by_platform` is the default for anything security-adjacent. Think once before downgrading to `editable_by_agency`.
- `request_based` is the right class for anything that could have platform-wide consequences if mis-used — custom CSS (not in V1 per L12), external webhook URLs, custom sender domains.

### Per-class examples

**`locked_by_platform`**
- `security.*` — everything under this namespace.
- `hub.eligibility.*` — what counts as hub-eligible is platform policy.
- `tenant.resolution.*` — routing semantics.
- `audit.retention.*` — legal retention floors.

**`editable_by_agency`**
- `agency_branding.*` — colors, fonts, logos (subject to entitlement caps on e.g. logo variants).
- `agency.inquiry_form.*` — which fields the storefront inquiry form shows, validation copy.
- `agency.notifications.digest_frequency` — daily vs weekly.
- `agency.directory.default_sort` — within an allowlist.

**`plan_gated`**
- `agency.locales.supported[]` — up to `entitlements.max_locales`.
- `agency.custom_fields.*` — count bounded by `entitlements.max_custom_fields`.
- `agency.ai_features.enabled` — gated by `entitlements.ai_enabled`.
- `agency.analytics.advanced_panels` — gated by `entitlements.advanced_analytics`.

**`request_based`** (V1 scope is narrow)
- None enabled in V1. V1.5+ candidates: `agency.email.sender_domain` (white-label email), `agency.css.custom` (if ever enabled behind L12 revisit + plan gate).

---

## 3. Feature flags at multiple levels (Plan §13)

Feature flags are a specialisation of settings. They resolve down the same precedence stack but are surfaced via a distinct helper `isFeatureEnabled(flagKey, { tenantId, userId })` for readability.

| Level | Source | Example |
|---|---|---|
| Platform global | Compiled / settings at Layer 4 | `ff_admin_workspace_v3` (global rollout, now retired post-M8) |
| Plan-level | `agency_entitlements` | `advanced_analytics` gate |
| Agency-level | `settings` WHERE `tenant_id = agency.id` | Agency opts out of a platform-enabled flag for their tenant |
| User-level (future) | `profiles` metadata or a dedicated `user_feature_flags` table | Beta cohort selection |

**Resolution cue.** A feature flag check resolves the same stack but returns a boolean; for ambiguity a flag resolver returns **false** if no layer provides a value (fail-closed). Do not ship a flag without a registered default at Layer 1 or Layer 4.

---

## 4. Phase 1 schema interaction (Plan §4.5)

The `settings` table gets `tenant_id` (nullable). Reads use the inheritance chain; writes are gated per mutability.

```
settings
  key          TEXT
  value        JSONB
  tenant_id    UUID NULL REFERENCES agencies(id)
  mutability   TEXT NOT NULL        -- locked_by_platform | editable_by_agency | plan_gated | request_based
  updated_by   UUID REFERENCES profiles(id)
  updated_at   TIMESTAMPTZ
  PRIMARY KEY (key, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'))
```

(Schema shape is a sketch — the exact PK strategy and whether `mutability` lives on `settings` or a separate `settings_registry` table is a Phase 3 implementation detail.)

### RLS split (Phase 2)

- Platform sees all rows.
- Agency staff see `tenant_id IS NULL` (read-only, derives defaults) + their own `tenant_id = agency.id` rows (read/write, subject to mutability).
- Cross-tenant reads explicitly denied.

### Default seed

- Migration seeds the current Impronta settings as `tenant_id IS NULL` (platform global at Layer 4).
- Tenant #1 (Impronta Models Tulum) inherits all of them with no agency-level overrides initially.
- As multi-tenancy rolls out, agency-scoped overrides land in tenant #1's row.

---

## 5. Read-side helper contract (Phase 3)

```ts
type SettingContext = {
  tenantId: string | null;
  contextId?: string;      // page id, collection id, etc. — for Layer 6
  planKey?: string;        // resolved from agency_entitlements
  templateKey?: string;    // resolved from agencies.template_key
};

type Setting<T> = {
  key: string;
  value: T;
  source: 'hardcoded' | 'plan' | 'template' | 'platform' | 'agency' | 'content';
  mutability: 'locked_by_platform' | 'editable_by_agency' | 'plan_gated' | 'request_based';
};

resolveSetting<T>(key: string, ctx: SettingContext): Setting<T>
```

`source` is returned in the result so that admin UIs can render "This value comes from the platform default" when the agency hasn't overridden it, and "Editable with Pro plan" when the plan gate blocks it.

---

## 6. Write-side guard contract (Phase 2)

```ts
writeSetting(
  key: string,
  value: unknown,
  ctx: { tenantId: string; actorUserId: string; reason?: string }
): Promise<void>
```

Guard steps (in order — first failure short-circuits):

1. Auth (deliverable 2 §10 precedence).
2. Tenant resolution (fail-hard).
3. Membership + `manage_agency_settings` capability.
4. Lookup key in registry; get `mutability`.
5. Dispatch by mutability:
   - `locked_by_platform` → reject unless actor is `super_admin` AND writing at Layer 4.
   - `editable_by_agency` → accept if capability passed.
   - `plan_gated` → check `agency_entitlements` for the gating flag; reject with plan-upgrade message if disabled.
   - `request_based` → do not write; instead create a `settings_change_request` row in `requested` state (uses the representation-request status vocabulary from deliverable 3 §6).
6. Bounds check against Layer 1 hardcoded ceiling (if any).
7. Write; emit `activity_log` + (if affects platform governance) `platform_audit_log`.

---

## 7. Settings registry discipline (ongoing)

Phase 3 will produce a canonical settings registry — a typed catalog of every key, its schema, default per layer, and mutability. Until then:

- Every new setting key lands via a migration or a registry PR.
- PR description names: the key, its layer-4 default, its mutability class, the capability that writes it, and any entitlement gate.
- No setting key lives in two different namespaces. Use dotted keys with a stable prefix (`security.*`, `agency.*`, `hub.*`, `cms.*`, `directory.*`, `ai.*`, `notifications.*`, `analytics.*`).

---

## 8. Cross-references

- Capabilities controlling settings writes — deliverable 2 §4 (`manage_agency_settings`, plus key-specific ones like `edit_branding`).
- Plan §7 (Template Model) — templates own Layer 3 defaults.
- Plan §10 (AI tenancy) — AI-specific settings are typically `plan_gated` and/or `locked_by_platform` in V1.
- Plan §24 (cross-surface leakage) — serialization defaults (e.g. "hub serializer denies overlay keys") live at Layer 1, not Layer 5.

---

## 9. Change control

- Reclassifying a key (e.g. `locked_by_platform → plan_gated`) is a Plan Decision Log event.
- Introducing a new layer (e.g. user-level) is a Plan amendment, not a Phase 3 implementation choice.
- The precedence order is **never** reordered without a Decision Log entry — it is the contract admins and agencies rely on.
