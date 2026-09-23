# Talent Messages integration log

Running log for connecting Messages v5 to talent profiles and free talent websites. Defects are `D-MSG-4xx` in `decisions.md`.

## 2026-09-23 · Gap 2 · inquiry tenant on a talent-site host

Branch `cursor/msg-inquiry-tenant-0d94`.

`pickTalentSiteInquiryTenant` (`web/src/lib/messaging/talent-inquiry-tenant.ts`) is the only decision. A roster row is a selling agency when the tenant is not the hub, `status` is `active`, `talent_site_hidden` is false, and `agency_visibility` is `site_visible` or `featured`.

- No selling agency (independent, including a hub roster row only) → hub, reason `independent`.
- Exactly one selling agency → that agency, reason `single_agency`.
- Two or more selling agencies → hub, reason `several_agencies`.
- Pending non-hub row and no hidden row → hub, reason `pending_roster`.
- Active non-hub row that is hidden or `roster_only` → hub, reason `hidden_roster`. Hidden wins when a pending row is also present.
- No hub id → `{ ok: false, reason: "no_hub" }`.

`loadTalentSiteInquiryTenant` loads the hub via `getPlatformHubTenant` and the roster columns from `agency_talent_roster`. `resolveTalentSiteHostTenant` reads `x-impronta-host-context` and `x-impronta-talent-profile`. On `talent_site` it returns the resolved tenant, or a null tenant id when resolution fails (no fallthrough to a client-supplied slug). Any other host returns `{ kind: "other" }` so `resolveTenantIdBySlug` keeps the slug lookup.

`TalentSiteMessagesDock` mounts the existing `TalentProfileChatLauncherMount` with `exposeTenantToClient={false}`. The client launcher receives `tenantId={null}`. The server still uses the id for dock flags and the edit-mode gate. Guest actions re-resolve the tenant from the host header.

No migration.

Filed D-MSG-400 (USD label on the hub legacy menu). That render is not on this path.

## 2026-09-23 · Gap 3 · client link for a talent-host conversation

Branch `cursor/msg-hub-client-link-0d94`.

`threadLinkUrl` mints `https://tulala.digital/c/t/<token>` when `source_context.host_kind` is `talent_site`. Any other host kind keeps the request origin. `messagingThreadLink` returns that absolute `url`. Copy link uses it, and falls back to the request origin only when the server did not return one.

## 2026-09-23 · Gap 1 · contact stays on her site

Branch `cursor/msg-talent-contact-0d94` (stacked on the inquiry-tenant branch until that merges).

`contactChannelButtons` puts three layers inside the existing Contact section, in order: Ask a question (`#talent-ask`), WhatsApp (`{{whatsappHref}}`), email (`{{emailHref}}`). Each has its own `layerLabel`. Hydrate drops WhatsApp and email when the href is empty, and keeps a button she marked hidden.

Ask does not navigate. The hero and the contact band use `#talent-ask`. `TalentSiteContactBridge` prevents the click and dispatches `tulala:open-guest-chat`. The existing launcher clears any pending service and opens. Older published buttons that still point at `/t/<code>?inquire=1` are intercepted the same way. When the tree has no `#talent-ask` anchor, the bridge shows a fallback bar with the same three channels.

WhatsApp comes from a published `shell://whatsapp/` link, a `wa.me` link, or her phone. Email comes from a published `mailto:` link. `invitation_email` is not read.

Booking copy calls `getAppointmentsPlanPolicy`: `talent_portfolio` is the website plan (instant), every other talent plan is free (she confirms by hand). The page sentence is that result. EN, ES, and FR are in `public.talentSite.contact`.

Smallest edits on Lane A files: `theme-catalog/section-kit.ts` (`inquiryCta` and `contactBlock`; `sections.ts` only re-exports the kit), `default-talent-tree.ts`, `token-projection.ts`, `starter.ts`, `load-starter-data.ts`, and the registry assertion that used to require the hub inquiry URL.
