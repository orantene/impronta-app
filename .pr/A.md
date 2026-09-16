## Site + builder: menu_board styling, link minting, ticket_picker v2, "Launch party" page design

Built for the Impronta LUMINA launch (sáb 3 oct), reusable by every tenant.

### menu_board (every tenant)
- The block never had a stylesheet: ~20 `site-builder-node--menu-board-*` classes and zero rules (only the 5 catnav rules from #1893). Impronta's home "Studio & workshops" rendered as a raw list with a "-0+" stepper. Now: `MB_CSS` in the island (the `TP_CSS` pattern) + server-half rules in the renderer sheet, tokens only, mobile first, 44px steppers.
- `render.tsx` passed `builderNodeStyleAttrs(undefined)` and never `inlineNodeStyle(p.style)`: the operator's authored block style was discarded. Fixed.
- The server list (SEO) and the island's stepper list rendered the same items twice; the island marks the section live and the server list becomes visually hidden.
- CSS budget kept without raising it: the `talent-type-grid` rules were byte-identical copies of the shared `p2a` set (merged) and indentation no longer ships (`stripCssComments` collapses it). Full sheet 126.0 → 125.8 KB with the new rules in.

### QR & Links: the first writer
- Nothing in the product called `createLink`; `public.links` could not get its first row from the UI. `mintLinkAction` (capability-gated, tenant from the guard, path-only targets, readable codes) + "Create a link" in the `qr_code` inspector.

### ticket_picker v2 (opt-in; v1 pages byte-compatible)
- New props: `layout: "cards"` (tier cards with image, badge, "includes" bullets, then three steps: ticket → how many → your details, with a live total), `presentation: "sheet"` (sticky Buy bar on phones opening a bottom sheet / desktop side panel, focus-trapped, Escape, scroll lock), `tiers[]` per-tier presentation keyed by variant id (no migration), `showNightPicker` (auto hides the one night), `ctaLabel`.
- Hidden "by link" tiers are now reachable: `/page?tier=<variantId>` (loader `includeVariantId`; the sale window stays the gate).
- Inspector: event `<select>` (no more pasting a UUID), presentation switches, one card per tier with image (MediaField), badge, includes, hidden.
- Island split into `-copy.ts`, `-css.ts`, `-steps.ts` (pure, tested) to stay under the file cap.

### "Launch party" page design
- `page-designs/event-launch.ts`: a one-scroll, mobile-first, gold-on-black launch page (announcement, full-bleed hero, marquee, programme timeline with hour badges, image card grid, show bands, late-entry promo, tickets, VIP table card, venue, FAQ), composed from existing kinds only; gallery preset `launch-party`; registered in the fidelity harness. Tickets ship as a `pricing_table` placeholder per `no-unconfigured-native-block`; the tenant swaps in Buy tickets.
- Four generated night photos (no faces, no brands) added as platform photos.

### Tests
`menu-board-css.static`, `mint-link` (5), `qr-code-link-picker-create.static`, `ticket-picker-steps` (5), `ticket-picker-island` (8, incl. 3 v2), page-designs (33), builder-node lane (1680+), size-ratchet, perf-budget.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
