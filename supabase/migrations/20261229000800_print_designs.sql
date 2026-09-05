-- print_designs — Piece B slice 1 (the print canvas surface's store).
--
-- A print design is a builder tree laid out at a fixed physical size (table
-- tent, A5, ...) for export to a print PDF. It is NOT a web page: it has no
-- slug, no publish-to-live, no revisions in v1. So it gets its own small table
-- rather than overloading cms_pages, per the Piece B design ruling.
--
-- The `print` BuilderSurfaceKind's minimal adapter (load/save only,
-- canRestoreRevision:false) reads and writes this table. Publish = export to a
-- PDF, which is slice 2 and touches this table only for read.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

CREATE TABLE IF NOT EXISTS public.print_designs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Untitled print design',
  -- One of the fixed physical sizes in web/src/lib/links/qr/files.ts
  -- (PRINT_SIZES). A print piece is a physical object; its size is not fluid.
  size          text NOT NULL DEFAULT 'table_tent',
  -- The freeform builder tree, same shape the other freeform surfaces persist.
  builder_tree  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Optimistic-concurrency counter. The adapter's save is compare-and-swap on
  -- this: it checks the caller's expectedVersion, then writes with version + 1,
  -- so a second tab editing the same design gets an honest "changed elsewhere"
  -- instead of a silent clobber. (site_shell derives its version from
  -- updated_at; print uses an explicit column, ruled 2026-09-05.)
  version       integer NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT print_designs_size_valid
    CHECK (size IN ('table_tent', 'a5', 'a4', 'sticker', 'card')),
  CONSTRAINT print_designs_tree_is_array
    CHECK (jsonb_typeof(builder_tree) = 'array')
);

CREATE INDEX IF NOT EXISTS print_designs_tenant_updated_idx
  ON public.print_designs (tenant_id, updated_at DESC);

ALTER TABLE public.print_designs ENABLE ROW LEVEL SECURITY;

-- Staff of the owning tenant may read and write their own print designs.
-- Service-role (the adapter's server path) bypasses RLS; this policy is the
-- defense-in-depth floor so a user-scoped read can never cross tenants.
CREATE POLICY print_designs_staff_all ON public.print_designs
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.print_designs IS
  'Print canvas designs — a builder tree at a fixed physical size, exported to '
  'a print PDF. Not a web page: no slug, no live publish, no revisions in v1. '
  'Written by the print BuilderSurfaceKind adapter.';
COMMENT ON COLUMN public.print_designs.size IS
  'A PRINT_SIZES key (table_tent/a5/a4/sticker/card). The physical size is '
  'fixed; the QR slot and bleed are computed against it at export.';
COMMENT ON COLUMN public.print_designs.builder_tree IS
  'The freeform builder tree, edited with the node model/inspector/undo the '
  'other surfaces use, with page chrome suppressed for the print artboard.';
