# W3 — Client-Render Canvas Blueprint (2026-06-04)

Goal: replace the server-rendered canvas + `router.refresh()`-per-edit with a **client-rendered canvas** → editing paints instantly, **Fast → 100**. Branch `feat/builder-premium-fixes`.

## The enabling fact
`renderBuilderNode` / `renderBuilderNodes` (`web/src/lib/site-admin/builder-node/render.tsx:2398/3166`) are **pure, hookless, synchronous, data-agnostic** — they read pre-resolved data from a `dataSources` render option (`:3173`). The only server-bound things are **fetches** (`loadBuilderNodeDataSources`, `homepage-cms-sections.tsx:611`, service-role) and **`section_embed`** async server-component islands (`section-embed-renderer.tsx:126`). So: feed the pure renderer the in-memory `builderTree` + a **serialized `dataSources` snapshot** on the client; keep `section_embed` as **server islands**; stop refreshing per edit.

## Binding constraint
Every overlay reads the live DOM (`querySelectorAll("[data-cms-section]"|"[data-builder-node-id]")` + `getBoundingClientRect`): `canvas-between-blocks-insert/gap-handles/resize-handles/move-handle`, `command-palette:271`, `iframe-bridge:177`, `composition-library:613`. The client render MUST emit **byte-identical** `data-*` + wrapper nesting (`homepage-cms-sections.tsx:506-514`) or every overlay breaks. Treat the `data-*` contract as frozen API.

## Staged sub-steps (each a PR + its own :3010 live-QA)
- **A — Memoize the renderer (no behavior change).** Extract per-node body into a `React.memo` `BuilderNodeView` (comparator bails on `Object.is(prevNode,nextNode)` + stable `options`). QA: page renders byte-identical (diff `[data-cms-section]` count + DOM snapshot); Profiler: editing one heading re-renders one node.
- **B — `<ClientBuilderCanvas>` behind a runtime flag** (`NEXT_PUBLIC_BUILDER_CLIENT_CANVAS`, default off); leaf/simple nodes client-rendered, data-bound + `section_embed` stay server islands (serialize `dataSources` to client). QA: flag-on → zero hydration warnings, identical `[data-cms-section]` count, selection/drag/resize work, data sections show real data; flag-off = exact current behavior.
- **C — Wire mutations to paint the client canvas in-place; flip flag on in dev** (keep trailing `router.refresh()` as safety net). QA: edit a heading → instant, **no network on keystroke-commit**; drag/undo paint instantly; no flicker.
- **D — Remove `router.refresh()` from the edit happy-path** (`edit-context.tsx` ~:3141/3212/3330/3538/3992/5493/5820); keep for VERSION_CONFLICT/publish/locale/multi-tab. QA: full edit session with DevTools RSC filter → **zero** RSC fetches on edits; conflict in 2 tabs still reconciles; publish still re-renders live.
- **E — Split the context into a selector store** (`useSyncExternalStore`/zustand for `builderTree`/selection; stable callbacks on context); migrate 43 consumers in per-cluster PRs. **Last** (highest blast radius). QA: Profiler — editing re-renders only the node + inspector field, not navigator/topbar/drawers.

## Hardest risks → mitigation
- **Stale canvas** → client canvas subscribes to `builderTree` *state* (not ref); strict `Object.is` memo; keep trailing refresh as net until D proves parity.
- **Data-bound/repeater nodes** → don't re-fetch; serialize server `dataSources` once, pass as the same render option; only binding/query changes trigger scoped reconcile.
- **`section_embed` islands** → keep server-rendered; client renders id-keyed placeholder host, preserves server HTML, `renderSectionEmbed` returns cached island.
- **Hydration mismatch** → share the exact wrapper-emitting code server+client; snapshot-diff in B; gate behind flag until zero warnings.
- **Context split (43 consumers)** → sequence last; per-cluster PRs; Profiler-verify isolation per batch.

## Key files
`edit-context.tsx` (queueRouterRefresh :1746, persistBuilderTree :3906 / setBuilderTree :3927 / refresh :3992, builderTree :2036/ref :2057, value useMemo :5932 ~200 keys/~143 consumers) · `homepage-cms-sections.tsx` (wrappers :506-514, renderBuilderNodes :279/563, loadBuilderNodeDataSources :611) · `render.tsx` (renderBuilderNode :2398, renderBuilderNodes :3166, dataSources :3173) · `section-embed-renderer.tsx:126` · `agency-home-storefront.tsx:94-122` · `page.tsx:23` force-dynamic.
