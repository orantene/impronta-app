# Tulala / Impronta — Domain & Portal Plan

**Status: BINDING architecture document.**
**Captured 2026-05-03 from founder spec.**
**Supersedes prior assumptions in `plan-execution.md` and the Phase 3 promotion order.**

---

## Core principle

Users should enter and trust the platform through the brand that invited them.

- Client invited by Impronta → starts on Impronta domain.
- Talent applying to Impronta → starts on Impronta domain.
- Agency admin managing Impronta → can use Impronta domain or app domain.
- Multi-agency power user → uses `app.tulala.digital`.
- Platform team → uses `app.tulala.digital/platform/admin`.

**Tulala powers the platform in the background. Impronta owns the branded front experience.**

---

## 1. Domain roles

### `tulala.digital` — marketing / public marketplace
Used for: marketing site, pricing, SEO pages, marketplace discovery, global talent pages, signup entry, public hub pages.

### `app.tulala.digital` — global app / fallback dashboard
Used for: login, multi-workspace users, talent dashboard fallback, client dashboard fallback, workspace admin fallback, **platform admin**, billing, settings.

### `<workspaceSlug>.tulala.digital` — branded workspace subdomain
Used for: Impronta-branded storefront, client portal, talent portal, branded admin shortcut, branded registration flows.

### `<customdomain>.com` — agency custom domain
Used for: full white-label experience for Agency / Network plans.

---

## 2. Plan-level URL matrix

| Plan    | Public workspace            | Branded subdomain         | Custom domain                | Admin                                    | Branded portals               |
|---------|-----------------------------|---------------------------|------------------------------|------------------------------------------|-------------------------------|
| Free    | `tulala.digital/<slug>`     | No                        | No                           | `app.tulala.digital/<slug>/admin`        | Path-based only               |
| Studio  | `tulala.digital/<slug>`     | Maybe                     | Maybe (add-on, later)        | `app.tulala.digital/<slug>/admin`        | Yes if subdomain enabled      |
| Agency  | `tulala.digital/<slug>`     | **Yes**                   | **Yes**                      | `app.tulala.digital/<slug>/admin` + shortcut | **Yes**                   |
| Network | `tulala.digital/<slug>`     | **Yes**                   | **Yes**                      | `app.tulala.digital/<slug>/admin` + shortcut | **Yes**                   |

**Free plan = up to 5 talents.**

---

## 3. URL canonical patterns

### Public workspace
- Path-based: `tulala.digital/<workspaceSlug>` (every plan)
- Branded subdomain: `<workspaceSlug>.tulala.digital` (Studio+)
- Custom domain: `<customdomain>.com` (Agency+)

### Public talent profiles — TWO contexts

**A. Global talent-owned profile**
- `tulala.digital/t/<talentSlug>`
- Inquiry source = Tulala global / talent-owned

**B. Agency-context talent profile**
- `tulala.digital/<workspaceSlug>/t/<talentSlug>` (path-based)
- `<workspaceSlug>.tulala.digital/t/<talentSlug>` (branded subdomain)
- `<customdomain>.com/t/<talentSlug>` (custom domain)
- Inquiry source = workspace agency

### Talent dashboard (branded + fallback)
- Branded: `<workspaceSlug>.tulala.digital/talent`, `<customdomain>.com/talent`
- Fallback: `app.tulala.digital/talent`
- Sub-pages: `/profile`, `/inbox`, `/calendar`, `/settings`, `/onboarding`

### Talent registration (branded)
- `<workspaceSlug>.tulala.digital/talent/register`
- `<customdomain>.com/talent/register`
- Friendly route: `<workspaceSlug>.tulala.digital/join`
- After signup → `/talent/onboarding` → `/talent`
- Behind the scenes: create user, create/claim talent profile, create relationship/application to workspace, set `source_workspace_id` + `origin_domain`.

### Client dashboard (branded + fallback)
- Branded: `<workspaceSlug>.tulala.digital/client`, `<customdomain>.com/client`
- Fallback: `app.tulala.digital/client`
- Sub-pages: `/discover`, `/inquiries`, `/bookings`, `/shortlists`, `/settings`

### Client registration (branded)
- `<workspaceSlug>.tulala.digital/client/register`
- `<customdomain>.com/client/register`
- After registration → `/client`
- Behind the scenes: create user, create client profile, attach client relationship/source to workspace, set `source_workspace_id` + `origin_domain`.

### Client inquiry flow from agency context
1. Lands on `<workspaceSlug>.tulala.digital/t/<talentSlug>`
2. Clicks "Request booking"
3. If not logged in → `/client/register?next=/t/<talentSlug>&intent=inquiry`
4. After registration → `/client/inquiries/new?talent=<talentSlug>`
5. Then → `/client`

### Admin URLs
- Canonical global: `app.tulala.digital/<workspaceSlug>/admin`
- Branded subdomain shortcut: `<workspaceSlug>.tulala.digital/admin`
- Custom domain shortcut: `<customdomain>.com/admin`
- Sub-pages: `/work`, `/roster`, `/clients`, `/site`, `/workspace`, etc.

### Platform admin
- `app.tulala.digital/platform/admin` (the only entry — never on agency subdomains)

---

## 4. Inquiry source ownership rule

**The source URL determines ownership.**

| Inquiry origin                                | Source                              |
|-----------------------------------------------|-------------------------------------|
| `tulala.digital/t/<talentSlug>`               | Tulala global / talent-owned        |
| `<workspaceSlug>.tulala.digital/t/<talentSlug>` | Agency (e.g. Impronta)            |
| `<customdomain>.com/t/<talentSlug>`           | Agency (e.g. Impronta) custom domain|

**The same talent can generate different inquiry ownership depending on where the client entered.**

This means inquiries need at least:
- `source_workspace_id` — the workspace whose context the inquiry was sent from (NULL for talent-owned global inquiries).
- `origin_domain` — the actual host the client was on.

---

## 5. Technical routing rule

**Same dashboard code renders on multiple hosts. Tenant context resolves differently per host.**

| Host                               | Tenant context source                  |
|------------------------------------|----------------------------------------|
| `app.tulala.digital/<slug>/...`    | URL slug (current Phase 3 model)       |
| `<slug>.tulala.digital/...`        | Host header → `agency_domains` table   |
| `<customdomain>.com/...`           | Host header → `agency_domains` table   |

The same React/Next route handlers serve all three; the middleware resolves the tenant from whichever signal is present.

---

## 6. Talent + workspace dual identity (AlsoTalent model)

A user can have multiple roles simultaneously:

- Talent only → `<slug>.tulala.digital/talent`
- Talent + workspace coordinator → `/talent` AND `/admin` accessible
- Talent + workspace admin → both dashboards available

One user account switches between Talent mode / Workspace-admin mode / Client mode within the same branded context.

---

## 7. Global vs branded context — distinction

### Global Tulala context
- `tulala.digital/t/<talentSlug>`
- `app.tulala.digital/talent`
- `app.tulala.digital/client`

User is interacting with Tulala globally. May belong to multiple agencies. Manages relationships across many sources.

### Impronta branded context
- `impronta.tulala.digital/t/<talentSlug>`
- `impronta.tulala.digital/talent`
- `impronta.tulala.digital/client`
- `impronta.tulala.digital/admin`

Branding, inquiry source, dashboard context, messages, and trust relationship are Impronta-specific. Tulala powers the backend invisibly.

---

## 8. Trust framing

- "Powered by Tulala" appears subtly in branded contexts.
- Main trust belongs to the agency.
- Clients/talent should never feel like they're registering with a random Tulala app — the agency brand is primary.

---

## Implementation gap analysis (as of 2026-05-03)

### ✅ Already shipped
- `tulala.digital` — marketing site (working)
- `app.tulala.digital` — login + global app
- `app.tulala.digital/<slug>/admin` — workspace admin (Phase 3)
- `app.tulala.digital/<slug>/talent` — talent dashboard (Phase 3.3)
- `app.tulala.digital/platform/admin` — platform super_admin (Phase 3.11, just shipped)
- `<slug>.tulala.digital` — agency storefront (existing)
- `<slug>.tulala.digital/t/<talentSlug>` — agency-context talent profile (existing, partly v2-wired)
- `tulala.digital/t/<talentSlug>` — global talent profile (existing)

### ❌ Gaps (work ahead)
1. **`tulala.digital/<slug>`** — path-based public workspace on tulala.digital (Free plan storefront)
2. **`tulala.digital/<slug>/t/<talentSlug>`** — workspace-scoped talent on tulala.digital path
3. **`<slug>.tulala.digital/admin`** — branded admin shortcut on agency subdomain
4. **`<slug>.tulala.digital/client`** — branded client dashboard
5. **`<slug>.tulala.digital/talent`** — branded talent dashboard on agency subdomain
6. **`<slug>.tulala.digital/talent/register`** — branded talent registration
7. **`<slug>.tulala.digital/client/register`** — branded client registration
8. **`<customdomain>.com/*`** — full custom domain support (agency tier)
9. **Inquiry source attribution** — `source_workspace_id` + `origin_domain` columns on inquiries
10. **`/join` friendly route** — alias for `/talent/register` on branded subdomains
11. **`<slug>.tulala.digital/client/inquiries/new`** — branded inquiry-creation flow

### Routing implications
- Surface allow-list (`web/src/lib/saas/surface-allow-list.ts`) needs updating: agency hosts must allow `/client`, `/client/register`, `/talent/register`, `/join`.
- Middleware host-resolution must handle three signals: URL slug, branded subdomain, custom domain.
- The `app.tulala.digital/<slug>/...` paths must remain canonical-redirected when accessed cross-host.

---

## Sequencing recommendation

This document changes the Phase 3 promotion order. Given current state, the right order is:

1. **Phase 3.11a** ✅ — Platform admin at `app.tulala.digital/platform/admin` (DONE).
2. **Phase 3.10 (revised)** — Client dashboard. Build at `app.tulala.digital/<slug>/client` first (matches existing tenant-slug pattern), then Phase 3.10b adds branded host routing for `<slug>.tulala.digital/client`.
3. **Phase 3.12** — Branded admin shortcut: enable `/admin` to render on agency subdomains (already partly allowed via `surface-allow-list.ts`).
4. **Phase 3.13** — Branded talent + client portals on agency subdomains (`<slug>.tulala.digital/talent`, `/client`). Build by sharing the same React routes used by the slug-based pattern, but with host-based tenant resolution.
5. **Phase 3.14** — Registration flows: `/talent/register`, `/client/register`, `/join` on branded subdomains.
6. **Phase 4 (in plan-execution.md)** — Custom domain support.
7. **Inquiry attribution migration** — add `source_workspace_id` + `origin_domain` to inquiries (additive, can ship anytime).

---

**This document is the source of truth for URL/portal architecture.**
**Conflicts with `plan-execution.md` resolve in favor of this document.**
