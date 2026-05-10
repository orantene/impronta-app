# P7A-0 — Builder-node persistence contract (technical deliverable)

**Canonical roadmap:** [builder-execution-plan-2026.md](./builder-execution-plan-2026.md).  
**Close-out:** **Proceed to P7A-1** — persistence path for `builderTree`, governance validation, and rollout gate (`advancedElementLibraryEnabled`) are specified in code + this doc.

## 1. BuilderNode persistence contract

| Concern | Implementation |
|--------|----------------|
| **Node shape** | `BuilderNode` discriminated union in [`types.ts`](../src/lib/site-admin/builder-node/types.ts); Zod props per kind in [`registry.ts`](../src/lib/site-admin/builder-node/registry.ts). |
| **Stable IDs** | Client-generated UUID-style ids (`create.ts`, `operations.ts`); **duplicate** operations mint fresh ids. |
| **Parent / child** | `BUILDER_NODE_REGISTRY[*].children` — `none`, `any`, or `allow_list` of `BuilderNodeKind`. Runtime checks: [`validate.ts`](../src/lib/site-admin/builder-node/validate.ts), [`drop-policy.ts`](../src/lib/site-admin/builder-node/drop-policy.ts). |
| **Ordering** | Sibling order = array order under parent; section shell orders CMS slots via `sortOrder` + [`normalizeCompositionSlots`](../src/components/edit-chrome/composition-slots.ts). |
| **Payload location** | Leaf content (`heading.text`, `button.href`, …) lives on **props**. Layout chrome (`container.layout`, `split.ratio`, …) on **props**. Optional `style` uses shared `BuilderNodeStyle`. |

### MVP allow-list mapping

Roadmap labels ↔ kinds: [`mvp-allow-list.ts`](../src/lib/site-admin/builder-node/mvp-allow-list.ts).  
**Gap (not first-ship primitives yet):** dedicated **Card** / **CTA Group** kinds — compose today with **container** + **button** rows or legacy section types until vertical pilots (7B/7C).

## 2. Allowed parent / child matrix

**Source of truth:** `BUILDER_NODE_REGISTRY` (not prose). Summary:

- **Root-capable kinds** (nested inside section-owned trees): see [`builderNodeKindAllowedAtRoot`](../src/lib/site-admin/builder-node/drop-policy.ts) in [`drop-policy.ts`](../src/lib/site-admin/builder-node/drop-policy.ts).
- **Containers** (`container`, `split`, carousel/masonry, accordion/tab panels) declare explicit **allow_list** children including MVP leaves (`heading` … `divider`, `spacer`).

## 3. Draft mutation path

| Step | Location |
|------|-----------|
| Client optimistic tree | `edit-context.tsx` — `builderTree` state + undo stacks. |
| Persist draft composition + tree | `saveHomepageCompositionAction` / `saveDraftHomepageAction` → [`composition-actions.ts`](../src/lib/site-admin/edit-mode/composition-actions.ts) → [`saveHomepageDraftComposition`](../src/lib/site-admin/server/homepage.ts). |
| CAS | `expectedVersion` / `cms_pages.version` on homepage saves (`homepageSaveDraftSchema`). |

## 4. Publish snapshot path

| Step | Location |
|------|-----------|
| Snapshot payload | `buildRevisionSnapshot` embeds `builderTree` when non-empty ([`homepage.ts`](../src/lib/site-admin/server/homepage.ts)). |
| Publish | `publishHomepage` + section publishes as existing Phase 5 pipeline; revisions record published snapshot. |

## 5. Reopen / read path

| Step | Location |
|------|-----------|
| Draft-first loader | [`loadDraftHomepage`](../src/lib/site-admin/server/homepage-reads.ts) — prefers draft `cms_page_sections`; fallback live. |
| Builder tree hydration | Latest revision **snapshot** `builderTree` merged with legacy slot projection via [`resolveSnapshotBuilderTree`](../src/lib/site-admin/builder-node/snapshot-tree.ts). |

## 6. Renderer path

| Concern | Location |
|---------|-----------|
| Published / preview render | [`render.tsx`](../src/lib/site-admin/builder-node/render.tsx) — unknown structural kinds fall through safely; leaf nodes render with `data-builder-node-id`. |

## 7. Inspector / navigator routing

| Concern | Location |
|---------|-----------|
| Selection | `selectedBuilderNodeId` + section-scoped trees in [`edit-context.tsx`](../src/components/edit-chrome/edit-context.tsx). |
| Inspector surfaces | [`inspector-dock.tsx`](../src/components/edit-chrome/inspector-dock.tsx), [`builder-node-content.tsx`](../src/components/edit-chrome/inspectors/builder-node-content.tsx), [`layout-panel.tsx`](../src/components/edit-chrome/inspectors/layout-panel.tsx). |
| Navigator labels | [`snapshot-tree.ts`](../src/lib/site-admin/builder-node/snapshot-tree.ts) `resolveBuilderNodeLabel`. |

## 8. Feature flag / kill switch

| Layer | Behavior |
|-------|-----------|
| **Plan gate** | [`isAdvancedElementLibraryEnabledForPlan`](../src/lib/site-admin/builder-node/element-library-policy.ts) — **free** → `false`; **studio / agency / network / legacy** → `true`. |
| **Client exposure** | [`advancedElementLibraryEnabled`](../src/components/edit-chrome/edit-context.tsx) on edit context. Insert affordances (navigator, canvas chip, Structure inspector) run kinds through [`filterKindsForAdvancedElementLibrary`](../src/lib/site-admin/builder-node/element-library-policy.ts) so **free** plans do not see nested “Add block” while section-template flows stay available. |
| **Future** | Optional `agencies`-level JSON flag — server reads would mirror plan gate for defense in depth. |

## 9. Test proof

| Command | Scope |
|---------|--------|
| `npm run typecheck` | Required. |
| `npm run test:tenant-isolation` | When new tenant-scoped server mutations land (none added in this deliverable). |
| Node tests | [`create.test.ts`](../src/lib/site-admin/builder-node/create.test.ts), [`mvp-allow-list.test.ts`](../src/lib/site-admin/builder-node/mvp-allow-list.test.ts), [`validate`](../src/lib/site-admin/builder-node/validate.ts) via tree fixtures. |

---

**Proceed to P7A-1**
