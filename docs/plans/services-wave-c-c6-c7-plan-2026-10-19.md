# Services Wave C: C6 and C7 plan (for Oran's approval)

Date: 2026-10-19. Status: APPROVED by PM 2026-10-19 (decisions below), nothing built yet. Parent plan: `services-execution-plan-2026-10-19.md` §2 Wave C.
Builds on: #4031 (resolver, merged), #4087 (C3 quick view), #4093 (C5 business service pages), #4035 (C1 slug library).
Everything below ships behind `SERVICE_PRESENTATION_RESOLVER_ENABLED` (default OFF), like C3 and C5.

Plan rules confirmed by Oran: free talent = no own page (quick view + share link); paid talent (`talent_pro`, `talent_portfolio`) = own page; business plans (studio, agency, network) = everything.

**Decisions (PM, 2026-10-19):**
1. A custom page per service is for business plans (studio, agency, network) AND paid talents. Free talents keep the default designed page.
2. Owners may hide the reviews, FAQ and photo widgets. The booking panel (price, CTA, policies) stays protected: it can be moved and restyled, never removed.

## C6: service page design set once per site, with a protected booking panel (TUL-1272 #6)

**Today.** A talent service page is one hand-coded component for every design (`web/src/lib/talent-site/server/service-main.tsx`). A business service page (C5, #4093) is a second hand-coded component (`web/src/app/(public)/_services/business-service-view.tsx`). Neither can be styled in the builder.

**What changes for the owner.** In the builder, a new entry, "Diseño de páginas de servicio" ("Service page design"), opens ONE template page per site. Every service page on the site uses it. The owner arranges ready-made service widgets the same way they arrange any page, and each widget fills itself from the service being viewed:
- gallery (the service's photos; the owner may hide it)
- title and facts (category, price, duration)
- description
- included / what to bring (from the typed facts already on the service)
- FAQ (the owner may hide it)
- reviews (the owner may hide it)
- related services
- free sections (text, image, CTA) the owner adds around them

**The protected booking panel.** Price, the Reservar / Pedir cotización button and the policies (free-cancel window, deposit or full payment) are one locked block. The owner can move it and restyle it (theme tokens, sticky or not on desktop), but cannot delete it, hide the price rule or edit its text. The phone sticky bar always stays. D-10a stays enforced inside the block: on_request never shows a price.

**Defaults.** Every theme gets a default template made of the same widgets in today's order, so a site that never opens the editor looks the same as today. `service-main.tsx` and the C5 view stay as the engine fallback when no template exists or it fails to render.

**Custom page for one service (business plans and paid talents; decision 1).** "Diseñar esta página" on a service copies the template into a page linked to that service, the same model events already use: `events.page_id`, `resolveLinkedBuilderPage` (`web/src/lib/events/event-page-link.ts`), a 308 from the builder page's own URL to the service URL, the `?edit=1` exemption, a "Página" tab on the service. The column already exists in the held migration 415800 (`talent_offerings.page_id`), so C6 needs no new migration beyond that one.

**"Edit this page" on talent sites (G3.8).** An owner viewing their own service page sees "Editar esta página", which opens the template (or the custom page) in the builder.

**Build slices (one PR each, off main):**
1. Widget kinds `service_gallery`, `service_facts`, `service_booking_panel` (locked), `service_faq`, `service_reviews`, `service_related` in the builder registry, renderer and inspector, bound to a "current service" data source. All four layers (schema, renderer, inspector, publish preflight) in the same PR.
2. The per-site template page (a page role, like the home page role) + the default template per theme + the route reads it, fallback to today's component.
3. Custom page per service (`page_id`, linked-page resolver, 308, Página tab). Needs migration 415800 applied first.
4. "Editar esta página" on talent hosts.

**Size.** Large: 4 PRs, roughly the size of the events page work. Slice 3 waits on migration 415800.

**Decided.** Both former open questions are answered above (decisions 1 and 2). The plan gate for slice 3 is "studio / agency / network workspace, or `talent_pro` / `talent_portfolio` talent"; free talents see the default template only.

## C7: rich service pages in every language; Posts link to services (TUL-1272 #8)

**Today.** Service pages fall back to Spanish for any language that is not ES or EN. The editor caps the description at 280 characters (the type allows 2000). Options, extras, deposit, service area and intake are not shown on the page. Posts already store a `service` block (`offering_id`, `web/src/lib/cms/post-blocks.ts`) and a `related_offering_id`, but they do not link to the service's page.

**What changes.**
- **Every language the site serves.** The page reads the title and description in the visitor's language from `title_i18n` / `description_i18n` (already loaded), falls back to the site's main language (not to Spanish), and emits hreflang only for languages that really have a translation. Copy for widget labels covers the site's languages via the existing words/translation layer; ES and EN are written by hand.
- **Richer facts.** Options (variants) with their prices and durations, extras (add-ons), deposit amount, service area / where it happens, and the intake questions the guest will be asked. Shown only when the service has them; nothing invented. Description cap in the editor raised to the type's 2000.
- **Posts link to services.** A post's `service` block and its related service render as a real link to the service: its own page when the plan has pages, otherwise the quick view share link (`/#servicio-...`). The service page lists "Publicaciones sobre este servicio" (posts that reference it), with links. Structured data: the post's `about` points at the service URL.

**Build slices (one PR each, off main):**
1. Language fallback and per-locale hreflang for talent and business service pages.
2. Richer facts (options, extras, deposit, area, intake) in the page, the quick view and the C6 widgets.
3. Posts to services links both ways + `about` in the post JSON-LD.

**Size.** Medium: 3 PRs. Slice 2 is easiest after C6 slice 1 (it fills the same widgets); slices 1 and 3 can go first.

## Order once approved

C4 (after #4087 merges) and C1 wiring (after #4035 merges) come first, then C7 slices 1 and 3, then C6 slices 1, 2, 4, then C7 slice 2, then C6 slice 3 after migration 415800 is applied.

## Rollback

Every slice is flag-gated and code-only, except C6 slice 3, which relies on held migration 415800 (additive; its rollback SQL is in the file header). Turning the flag off restores today's pages.
