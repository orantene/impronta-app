# Classes Publish Path — TRUST Bug Audit

**Area:** Classes publish path  
**Date:** 2026-06-05  
**Severity:** High (trust-breaking — silent data loss on publish)

---

## What the code actually does today

Style classes are authored and persisted entirely inside the browser:

1. **Creation / editing** — `LinkedStyleClassesBar` (`inspectors/linked-style-classes-bar.tsx`) lets
   an operator create a class from a block's current style, rename it, apply it to a block, or
   update it from the block. All writes go directly to `localStorage` under the key
   `tulala:builder:style-classes:v1:<pageId>`.

2. **Block linkage** — applying a class writes only `{ classRef: "<class-id>" }` onto the block's
   `style` in the builder tree. The tree IS persisted to Supabase (via `edit-context.tsx`'s
   `dispatchMutation` → `saveSectionAction`), so the `classRef` token survives a publish.

3. **Class registry at render time** — `renderBuilderNodes` in `render.tsx` accepts an optional
   `styleClasses: BuilderStyleClassRegistry` option (line 80). When a node has `style.classRef`,
   `applyStyleClass` (line 2403) calls `resolveNodeStyleWithClass` to merge class → node styles.
   If `styleClasses` is absent or does not contain the referenced id, the node silently falls
   through to its own (empty or partial) style.

4. **The gap** — no caller ever passes `styleClasses` to the server render path:
   - `homepage-cms-sections.tsx` lines 321 and 601: calls `renderBuilderNodes` with no `styleClasses`.
   - `client-builder-canvas.tsx` line 101: calls `renderBuilderNodes` with no `styleClasses`.
   - `PublishedShell.tsx` line 326: calls `renderBuilderNodes` with no `styleClasses`.
   - `HomepageSnapshot` (`server/homepage.ts` line 127) has no `styleClasses` field.
   - The publish action (`homepage.ts` line 1079) writes `builderTree` into the snapshot but
     no class registry alongside it.

5. **Class Manager in the navigator** — `ClassManagerPanel` in `navigator-panel.tsx`
   (line 4090) reads the same `localStorage` key and lets operators rename classes. It is
   explicitly documented at line 4086: *"Deferred: ... syncing the class registry into the
   persisted page snapshot"*. `LinkedStyleClassesBar` carries the same NOTE at line 38–41.

### Consequence of the gap

An operator:
1. Creates a class "Card elevated" from a styled block.
2. Links three other blocks to it.
3. Publishes the page.

The published page renders all four blocks with an EMPTY style because:
- Their `style` is `{ classRef: "card-elevated" }` — one key, no visual props.
- The server renderer receives no registry, so `resolveNodeStyleWithClass` returns
  `stripClassRef({ classRef: "card-elevated" })` = `{}`.
- The blocks have no background, no padding, no typography — they are invisible
  or unstyled rectangles.

Clearing browser localStorage (private window, new device, clearing browser data) loses
the class definitions permanently. The `classRef` tokens in the saved tree are now dangling.
No warning is shown anywhere in the editor.

---

## Recommendation: ship the real publish path (do not gate/hide)

The infrastructure already exists. The renderer accepts `styleClasses` and the merge logic
is fully tested in `style-classes.test.ts`. The only missing link is persisting the registry
alongside the tree and threading it back to every render call. This is a small, well-scoped
change. Gating Classes behind a "coming soon" label instead is the wrong call because:

- The `classRef` tokens are ALREADY being written to the persisted tree by any operator who
  has tried the feature. Hiding the tab doesn't remove the dangling refs already in prod.
- The fix is ~4 touch-points, no DB migration needed.

### Publish path: the 4 touch-points

**Touch-point 1 — add `styleClasses` to `HomepageSnapshot`** (`server/homepage.ts` line 127)

```ts
export interface HomepageSnapshot {
  version: 1;
  publishedAt: string;
  pageVersion: number;
  locale: Locale;
  fields: { ... };
  templateSchemaVersion: number;
  slots: HomepageSnapshotSection[];
  builderTree?: BuilderNodeTree | null;
  styleClasses?: Record<string, BuilderStyleClass> | null;  // ADD THIS
}
```

`BuilderStyleClassRegistry` is already `Readonly<Record<string, BuilderStyleClass>>` —
serialize it as a plain object in the snapshot JSONB. No migration needed; the column
is already JSONB and the new field is additive + optional.

**Touch-point 2 — collect the registry at publish time** (`server/homepage.ts` near line 1079)

The publish action must accept the class registry from the client. The existing
`publishHomepage` function receives form values from the edit chrome. Add
`styleClasses?: BuilderStyleClassRegistry` to the values type and include it in the
snapshot:

```ts
const snapshot: HomepageSnapshot = {
  ...
  builderTree: publishedBuilderTree,
  styleClasses: values.styleClasses ?? null,  // ADD THIS
};
```

The edit chrome already calls the publish action from within EditProvider, which has
access to `pageId`. The client-side registry is in localStorage keyed by `pageId`.
Before dispatching publish, read `localStorage` → pass as part of values.

Alternatively (safer, avoids client→server data trust): bake the classes INTO the tree
at publish time using the existing `resolveBuilderTreeClassRefs` helper
(`style-classes.ts` line 203). This fully flattens every `classRef` into its resolved
style at the moment of publish and requires NO registry in the snapshot. The trade-off:
editing the class post-publish has no effect until re-publish, but that is the correct
semantics for a snapshot-based CMS anyway.

**Recommended approach: bake at publish** — use `resolveBuilderTreeClassRefs` on the
`publishedBuilderTree` before writing the snapshot. Read the registry from the
`styleClasses` value (passed from client localStorage at publish time). Zero
new columns, zero schema change, zero reader changes.

```ts
// In publishHomepage, just before building the snapshot:
const registry = values.styleClasses ?? {};
const bakedTree = resolveBuilderTreeClassRefs(publishedBuilderTree ?? [], registry);
// Then use bakedTree instead of publishedBuilderTree in the snapshot.
```

**Touch-point 3 — pass registry to client canvas** (`client-builder-canvas.tsx`)

The live editor canvas calls `renderBuilderNodes` without `styleClasses` (line 101).
The canvas should receive the live registry so linked blocks look correct in the editor.
The simplest approach: read `localStorage` inside `ClientBuilderCanvas` at render time.
This is already a client component, so `localStorage` access is fine on the client.

```ts
import { readClasses } from "@/lib/site-admin/builder-node/style-classes-storage";
// ...
const styleClasses = useMemo(() => {
  const arr = readClasses(pageId);
  return Object.fromEntries(arr.map(c => [c.id, c]));
}, [pageId]);

return renderBuilderNodes(tree, { ..., styleClasses });
```

The `readClasses` function already exists in `linked-style-classes-bar.tsx` — extract
it to a shared module (`builder-node/style-classes-storage.ts`) so both the bar and
the canvas import it without duplication.

**Touch-point 4 — server snapshot reader** (`homepage-cms-sections.tsx`)

After baking-at-publish (touch-point 2), no change needed here — the tree in the
snapshot is already fully resolved. If the live-registry approach is preferred instead,
the snapshot reader must load `snapshot.styleClasses` and pass it to `renderBuilderNodes`.

---

## What to do about existing dangling `classRef` tokens in prod

Any blocks already linked to classes and published have `{ classRef: "..." }` with an
empty effective style. Two options:

1. **Re-publish** — the bake-at-publish fix resolves them at the next publish.
2. **One-time heal** — a migration or admin script that calls `resolveBuilderTreeClassRefs`
   on every existing snapshot. Since the class registry is only in localStorage this is
   not feasible server-side. The re-publish path is the right answer.

If operators have already complained about invisible blocks, add a banner in the editor:
*"One or more blocks on this page use a style class. Re-publish to apply styles."*
Detect this by checking whether any `builderTree` node has `style.classRef` AND the
snapshot's `styleClasses` field is absent/empty.

---

## Effort and risk

| Step | Effort | Risk |
|---|---|---|
| Extract `readClasses` to shared storage module | XS | Low |
| Pass live registry to client canvas | XS | Low |
| Bake-at-publish via `resolveBuilderTreeClassRefs` | S | Low — helper is tested |
| Pass registry from EditProvider at publish time | S | Low — localStorage read |
| Editor banner for pages with dangling classRefs | XS | Low |

Total: ~M. No DB migration. No new tables. Renderer change is additive.

The alternative — "coming soon" gate — would require:
1. Removing the Classes tab from the navigator.
2. Removing `LinkedStyleClassesBar` from the inspector.
3. Finding and flattening all existing `classRef` tokens already in prod snapshots.
4. Communicating to any operator who used the feature that their work is gone.

That is strictly MORE work and causes actual data loss. Ship the publish path.
